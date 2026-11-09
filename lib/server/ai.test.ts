import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), config: vi.fn(), provider: vi.fn() }));
vi.mock("./workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./ai-provider", () => ({ aiConfig: mocks.config, callAiProvider: mocks.provider }));
import { requestAssistant } from "./ai";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", uiWorkspace().business.id);
  mocks.workspace.mockResolvedValue(uiWorkspace());
  mocks.config.mockImplementation(attempt => attempt === "backup"
    ? { kind: "openrouter", key: "test-only", model: "test/model:free", provider: "test-provider" }
    : { kind: "gemini", key: "test-only", model: "gemini-3.1-flash-lite", provider: "google" });
  mocks.provider.mockResolvedValue({ value: { summary: "Expected pa lang ang bayad.", recordIds: [] }, usage: { cost: null } });
});
afterEach(() => vi.unstubAllEnvs());
const input = { task: "explain", question: "May cash gap ba?", expectedRevision: 1 };
describe("authorized AI orchestration", () => {
  it("reserves before inference, then validates against a fresh authorized snapshot", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: uiWorkspace() });
    expect(await requestAssistant(input)).toMatchObject({ proposal: { sourceRevision: 1, task: "explain" } });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["reserve_ai_request", "workspace_snapshot"]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.mock.invocationCallOrder[0]);
  });
  it("does not spend a request on stale, foreign, non-demo or unconfigured requests", async () => {
    await expect(requestAssistant({ ...input, expectedRevision: 0 })).rejects.toThrow("STALE_VERSION");
    await expect(requestAssistant({ ...input, invoiceId: "10000000-0000-4000-8000-000000000099" })).rejects.toThrow("NOT_FOUND");
    mocks.workspace.mockResolvedValueOnce({ ...uiWorkspace(), business: { ...uiWorkspace().business, is_demo: false } });
    await expect(requestAssistant(input)).rejects.toThrow("AI_DEMO_ONLY");
    mocks.config.mockImplementationOnce(() => { throw new Error("AI_UNAVAILABLE"); });
    await expect(requestAssistant(input)).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("blocks a request when the allowance is exhausted and discards changes during inference", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "AI_LIMIT" } });
    await expect(requestAssistant(input)).rejects.toThrow("AI_LIMIT");
    expect(mocks.provider).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...uiWorkspace(), revision: 2 } });
    await expect(requestAssistant(input)).rejects.toThrow("STALE_VERSION");
  });
  it("reserves each explicit provider attempt separately and never sends routing in the prompt", async () => {
    const backup = { kind: "openrouter", key: "test-only", model: "test/model:free", provider: "test-provider" };
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: 2 }).mockResolvedValueOnce({ data: uiWorkspace() });
    mocks.provider.mockRejectedValueOnce(new Error("AI_PROVIDER_BUSY"));
    await expect(requestAssistant(input)).rejects.toThrow("AI_PROVIDER_BUSY");
    expect(await requestAssistant({ ...input, attempt: "backup" })).toMatchObject({ model: backup.model, provider: backup.provider });
    expect(mocks.config.mock.calls).toEqual([[undefined], ["backup"]]);
    expect(mocks.rpc.mock.calls).toEqual([
      ["reserve_ai_request", { p_expected_revision: 1, p_model: "gemini-3.1-flash-lite", p_provider: "google" }],
      ["reserve_ai_request", { p_expected_revision: 1, p_model: backup.model, p_provider: backup.provider }],
      ["workspace_snapshot"],
    ]);
    expect(JSON.parse(mocks.provider.mock.calls[1][1][1].content).request).not.toHaveProperty("attempt");
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
});
