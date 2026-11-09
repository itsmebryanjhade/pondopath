import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), config: vi.fn(), provider: vi.fn() }));
vi.mock("./workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./ai-provider", () => ({ aiConfig: mocks.config, callAiProvider: mocks.provider }));
import { requestAssistant } from "./ai";

const primary = { kind: "gemini", key: "test-only", model: "gemini-3.1-flash-lite", provider: "google" };
const input = { task: "explain", question: "May cash gap ba?", expectedRevision: 1 };
const chat = { task: "chat", question: "Ano naman ang cash ngayon?", expectedRevision: 1,
  history: [{ question: "Ano ang cash plan?", answer: "Ito ang plano sa susunod na mga araw." }],
};
const grounded = { kind: "answer", summary: "Cash now is the balance from verified records.",
  factIds: ["cash-now"], recordIds: [], draft: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", uiWorkspace().business.id);
  mocks.workspace.mockResolvedValue(uiWorkspace());
  mocks.config.mockReturnValue(primary);
  mocks.provider.mockResolvedValue({ value: { summary: "Expected pa lang ang bayad.", recordIds: [] }, usage: { cost: null } });
});
afterEach(() => vi.unstubAllEnvs());

describe("authorized AI orchestration", () => {
  it("reserves before inference, then validates against a fresh authorized snapshot", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: uiWorkspace() });
    expect(await requestAssistant(input)).toMatchObject({ proposal: { sourceRevision: 1, task: "explain" }, model: primary.model, provider: primary.provider });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["reserve_ai_request", "workspace_snapshot"]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.mock.invocationCallOrder[0]);
  });

  it("rejects a client-selected provider attempt before authorization or inference", async () => {
    await expect(requestAssistant({ ...input, attempt: "backup" })).rejects.toThrow();
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("sends a follow-up with text-only history and uses one Gemini reservation and app-owned facts", async () => {
    const workspace = uiWorkspace();
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: workspace });
    mocks.provider.mockResolvedValueOnce({ value: grounded, usage: { cost: null } });
    expect(await requestAssistant(chat)).toMatchObject({
      proposal: { task: "chat", sourceRevision: 1, facts: [{ id: "cash-now", value: "₱40,000.00" }], draft: null },
      model: primary.model, provider: primary.provider,
    });
    expect(mocks.config).toHaveBeenCalledWith();
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mocks.provider.mock.calls[0][1][1].content);
    expect(payload.request.history).toEqual(chat.history);
    expect(payload.data.records).toEqual(expect.any(Array));
    expect(JSON.stringify(payload)).not.toContain(workspace.actor.userId);
    expect(mocks.rpc.mock.calls).toEqual([
      ["reserve_ai_request", { p_expected_revision: 1, p_model: primary.model, p_provider: primary.provider }],
      ["workspace_snapshot"],
    ]);
  });

  it("clarifies an unspecified invoice or date locally without reserving or loading a provider", async () => {
    const invoiceId = uiWorkspace().invoices[0].id;
    for (const request of [
      { ...chat, question: "Paki draft po", intent: "draft_reminder" },
      { ...chat, question: "Follow up tomorrow", intent: "draft_followup", context: { page: "invoices", record: { kind: "invoice", id: invoiceId } } },
    ]) {
      expect(await requestAssistant(request)).toMatchObject({ proposal: { task: "chat", kind: "clarify", draft: null }, usage: null, model: null, provider: null });
    }
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("does not reserve unauthenticated, stale, foreign, non-demo, unapproved or unconfigured requests", async () => {
    mocks.workspace.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    await expect(requestAssistant(chat)).rejects.toThrow("UNAUTHENTICATED");
    await expect(requestAssistant({ ...chat, expectedRevision: 0 })).rejects.toThrow("STALE_VERSION");
    await expect(requestAssistant({ ...chat, context: { page: "invoices", record: { kind: "invoice", id: "10000000-0000-4000-8000-000000000099" } } })).rejects.toThrow("NOT_FOUND");
    mocks.workspace.mockResolvedValueOnce({ ...uiWorkspace(), business: { ...uiWorkspace().business, is_demo: false } });
    await expect(requestAssistant(input)).rejects.toThrow("AI_DEMO_ONLY");
    vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", "different-workspace");
    await expect(requestAssistant(chat)).rejects.toThrow("AI_DEMO_ONLY");
    vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", uiWorkspace().business.id);
    mocks.config.mockImplementationOnce(() => { throw new Error("AI_UNAVAILABLE"); });
    await expect(requestAssistant(chat)).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it.each(["AI_LIMIT", "AI_MEMBER_LIMIT"])("rejects a chat turn when the database returns %s", async code => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: code } });
    await expect(requestAssistant(chat)).rejects.toThrow(code);
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("discards chat replies after a revision, role, membership or demo eligibility change", async () => {
    const workspace = uiWorkspace();
    mocks.provider.mockResolvedValue({ value: grounded, usage: { cost: null } });
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...workspace, revision: 2 } });
    await expect(requestAssistant(chat)).rejects.toThrow("STALE_VERSION");
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...workspace, actor: { ...workspace.actor, role: "finance" } } });
    await expect(requestAssistant(chat)).rejects.toThrow("AI_UNAVAILABLE");
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ error: { message: "FORBIDDEN" } });
    await expect(requestAssistant(chat)).rejects.toThrow("AI_UNAVAILABLE");
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...workspace, business: { ...workspace.business, is_demo: false } } });
    await expect(requestAssistant(chat)).rejects.toThrow("AI_UNAVAILABLE");
  });

  it("routes explicit mapping help through the demo reservation and sends no raw workbook values", async () => {
    const mapping = {
      task: "suggest_import_mapping", expectedRevision: 1,
      headers: [{ id: "c0", name: "Customer" }, { id: "c1", name: "Amount" }, { id: "c2", name: "Due" }],
      samples: [["<text>", "<amount>", "<date>"]],
    };
    const result = { fields: { externalId: "c0", number: "c0", amount: "c1", dueDate: "c2", customer: null, payee: null, label: null, typeColumn: null, paidAmount: null, openBalance: null, status: null }, unresolved: ["label", "payee"] };
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: uiWorkspace() });
    mocks.provider.mockResolvedValueOnce({ value: result, usage: { cost: null } });
    expect(await requestAssistant(mapping)).toMatchObject({ proposal: { task: "suggest_import_mapping", fields: result.fields, unresolved: result.unresolved } });
    expect(mocks.rpc.mock.calls[0][0]).toBe("reserve_ai_request");
    expect(mocks.provider.mock.calls[0][1][0].content).toContain("SUGGEST_IMPORT_MAPPING");
    const prompt = JSON.stringify(JSON.parse(mocks.provider.mock.calls[0][1][1].content));
    expect(prompt).toContain("<amount>");
    expect(prompt).not.toContain("Mabuhay Cafe");
    expect(prompt).not.toContain("<workspace-actor-id>");
  });

  it("routes extract_record through the demo reservation and validates the proposal", async () => {
    const customer = uiWorkspace().customers[0];
    const text = `Invoice 1042, ${customer.name}, 25k, due 2026-11-30`;
    const req = { task: "extract_record", text, expectedRevision: 1 };
    const output = {
      proposals: [
        {
          kind: "invoice",
          number: "1042",
          label: null,
          party: customer.name,
          amountCents: 2_500_000,
          dueDate: "2026-11-30",
          sourceQuotes: [text],
          issues: [],
          needsReview: false,
        },
      ],
    };
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: uiWorkspace() });
    mocks.provider.mockResolvedValueOnce({ value: output, usage: { cost: null } });
    const response = await requestAssistant(req);
    expect(response).toMatchObject({
      proposal: {
        task: "extract_record",
        sourceRevision: 1,
        proposals: [
          {
            kind: "invoice",
            number: "1042",
            customerId: customer.id,
            amountCents: 2_500_000,
            dueDate: "2026-11-30",
          },
        ],
      },
    });
    expect(mocks.rpc.mock.calls[0][0]).toBe("reserve_ai_request");
    expect(mocks.provider.mock.calls[0][1][0].content).toContain("EXTRACT_RECORD");
  });
});
