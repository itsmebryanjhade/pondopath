import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAssistantChatRequest,
  generatePageStarters,
  resolveAssistantDraftTarget,
  sendAssistantChat,
  sendReplyExtraction,
} from "./assistant-chat-adapter";
import type { AssistantChatProposal } from "@/lib/domain/assistant-chat";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const workspace = uiWorkspace();
const invoiceId = workspace.invoices[0].id;
const scope = {
  expectedRevision: workspace.revision, language: "taglish",
  context: { page: "invoices", record: { kind: "invoice", id: invoiceId } },
  intent: "draft_reminder",
} as const;
const proposal = {
  task: "chat", kind: "answer", summary: "Here is the cash outlook.", sourceRevision: workspace.revision,
  facts: [{ id: "cash-now", label: "Cash now", value: "₱40,000.00" }],
  sources: [{ id: invoiceId, kind: "invoice", label: "DEMO-001", href: "/invoices/" + invoiceId }],
  draft: null,
} satisfies AssistantChatProposal;
const message = (role: string, text: string, status = "complete") =>
  ({ role, content: [{ type: "text", text }], status: { type: status } });
const request = [message("user", "What should I check?")];
const signal = () => new AbortController().signal;
const success = (result: unknown = proposal) => Response.json({ ok: true, proposal: result, usage: null, model: null, provider: null });

afterEach(() => vi.unstubAllGlobals());

describe("Task 3 chat adapter", () => {
  it("posts only the Task 3 fields and accepts a verified result or local clarification", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(success()).mockResolvedValueOnce(success({
      ...proposal, kind: "clarify", summary: "Choose one invoice.", facts: [], sources: [],
    }));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendAssistantChat(request, scope, signal())).resolves.toEqual({ ...proposal, actions: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/assistant");
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: expect.any(AbortSignal) });
    expect(JSON.parse(options.body)).toEqual({ task: "chat", question: "What should I check?", history: [], ...scope });
    await expect(sendAssistantChat(request, scope, signal())).resolves.toMatchObject({ kind: "clarify", draft: null });
  });

  it("sends only the last three completed text pairs and excludes failed turns, tool parts, and the new question", () => {
    const pairs = [1, 2, 3, 4].flatMap(i => [message("user", "Q" + i), message("assistant", "A" + i)]);
    const input = buildAssistantChatRequest([
      ...pairs, message("user", "Failed"), message("assistant", "Should be omitted", "incomplete"),
      { role: "user", content: [{ type: "data", text: "private tool data" }, { type: "text", text: "New question" }] },
    ], scope);
    expect(input.question).toBe("New question");
    expect(input.history).toEqual([2, 3, 4].map(i => ({ question: "Q" + i, answer: "A" + i })));
  });

  it("trims the oldest whole pair against the full UTF-8 request limit", async () => {
    const pairs = [1, 2, 3].flatMap(i => [message("user", String(i)), message("assistant", "あ".repeat(3000))]);
    const input = buildAssistantChatRequest([...pairs, message("user", "界".repeat(1000))], scope);
    expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThanOrEqual(16_384);
    expect(input.history.map(pair => pair.question)).toEqual(["3"]);
    await expect(sendAssistantChat([message("user", "a".repeat(1001))], scope, signal())).rejects.toThrow();
  });

  it.each(["https://untrusted.example", "/invoices/another", "/expenses?page=2#expense-other"])(
    "rejects an unverified source link %s and a mismatched revision", async href => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(success({ ...proposal, sources: [{ ...proposal.sources[0], href }] }))
        .mockResolvedValueOnce(success({ ...proposal, sourceRevision: workspace.revision + 1 })));
      await expect(sendAssistantChat(request, scope, signal())).rejects.toThrow();
      await expect(sendAssistantChat(request, scope, signal())).rejects.toThrow(/Records changed/);
    },
  );

  it("accepts the app's paginated expense link and preserves the selected invoice draft", async () => {
    const expenseId = workspace.expenses[0].id;
    const result = {
      ...proposal,
      sources: [...proposal.sources, { kind: "expense", id: expenseId, label: "Bill", href: "/expenses?page=2#expense-" + expenseId }],
      draft: { kind: "followup", invoiceId, text: "Check the collection status.", date: "2026-11-06" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success(result)));
    await expect(sendAssistantChat(request, { ...scope, intent: "draft_followup" }, signal())).resolves.toEqual({ ...result, actions: [] });
  });

  it.each([
    [403, "FORBIDDEN", "Open the assistant from your signed-in workspace."],
    [409, "STALE_VERSION", "Refresh records before asking again."],
    [429, "AI_LIMIT", "The daily allowance is used."],
    [503, "AI_PROVIDER_BUSY", "The provider is unavailable."],
    [504, "AI_TIMEOUT", "The assistant timed out."],
  ])("returns a recoverable error for %s without resending", async (status, code, message) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: false, code, message }, { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendAssistantChat(request, scope, signal())).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("handles sign-in redirects and non-JSON replies safely", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.redirect("http://localhost:3000/login"))
      .mockResolvedValueOnce(new Response("<html>failure</html>")));
    await expect(sendAssistantChat(request, scope, signal())).rejects.toThrow(/Sign in again/);
    await expect(sendAssistantChat(request, scope, signal())).rejects.toThrow(/unavailable/i);
  });

  it("discards an answer that arrives after cancellation even if the fetch completes", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const controller = new AbortController();
    const pending = sendAssistantChat(request, scope, controller.signal);
    controller.abort();
    finish(success());
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps the extraction review result while rejecting a response for another invoice", async () => {
    const extraction = {
      task: "extract_reply", sourceRevision: workspace.revision, invoiceId,
      amountCents: null, date: null, reason: null, needsReview: true,
      sourceQuotes: ["PHP 20000"], issues: Array.from({ length: 9 }, (_, i) => "Issue " + i),
    };
    const input = { task: "extract_reply", expectedRevision: workspace.revision, language: "taglish", invoiceId, reply: "PHP 20000" } as const;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(success(extraction)).mockResolvedValueOnce(success({
      ...extraction, invoiceId: "00000000-0000-4000-8000-000000000999",
    })));
    await expect(sendReplyExtraction(input, signal())).resolves.toEqual(extraction);
    await expect(sendReplyExtraction(input, signal())).rejects.toThrow();
  });

  it("matches the draft invoice and its customer rather than either first row", () => {
    const current = uiWorkspace();
    const secondCustomer = { ...current.customers[0], id: "00000000-0000-4000-8000-000000000999" };
    const secondInvoice = { ...current.invoices[0], id: "00000000-0000-4000-8000-000000000998", customer_id: secondCustomer.id };
    current.customers.push(secondCustomer);
    current.invoices.push(secondInvoice);
    const result = { ...proposal, draft: { kind: "reminder", invoiceId: secondInvoice.id, text: "Please check the invoice." } } as const;
    expect(resolveAssistantDraftTarget(current, result)).toEqual({ invoice: secondInvoice, customer: secondCustomer });
    expect(resolveAssistantDraftTarget({ ...current, revision: current.revision + 1 }, result)).toBeNull();
    expect(resolveAssistantDraftTarget({ ...current, customers: current.customers.slice(0, 1) }, result)).toBeNull();
    expect(resolveAssistantDraftTarget({ ...current, invoices: current.invoices.slice(0, 1) }, result)).toBeNull();
  });

  it("provides three distinct supported starters on each workspace page", () => {
    expect(generatePageStarters("/overview")[0]).toBe("What should I do first?");
    expect(generatePageStarters("/forecast")[0]).toContain("projected shortage");
    expect(generatePageStarters("/invoices")[0]).toContain("customer owes the most");
    expect(generatePageStarters("/expenses")[0]).toContain("bills are due");
    for (const pathname of ["/overview", "/forecast", "/invoices", "/expenses", "/cash", "/followups"]) {
      expect(new Set(generatePageStarters(pathname)).size).toBe(3);
    }
  });
});
