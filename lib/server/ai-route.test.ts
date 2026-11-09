import { afterEach, describe, expect, it, vi } from "vitest";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ request: vi.fn(), workspace: vi.fn(), rpc: vi.fn() }));
vi.mock("./ai", () => ({ requestAssistant: mocks.request }));
vi.mock("./workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
import { POST } from "../../app/api/assistant/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
function request(body: BodyInit, headers: Record<string, string> = {}) {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body });
}
describe("assistant HTTP boundary", () => {
  it("rejects missing/foreign origins and non-JSON bodies before inference", async () => {
    for (const headers of [{ origin: "" }, { origin: "https://other.example" }, { "content-type": "text/plain" }] as Record<string, string>[]) {
      expect((await POST(request("{}", headers))).status).toBeGreaterThanOrEqual(400);
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["pondopath.vercel.app", "pondopath.sanx.dev"])("accepts a same-origin request to %s on Vercel without APP_URL", async host => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_URL", undefined);
    const input = { task: "chat", question: "What should I do first?", history: [], expectedRevision: 1 };
    mocks.request.mockResolvedValueOnce({ proposal: { task: "chat" } });
    const response = await POST(new Request("http://localhost:3000/api/assistant", {
      method: "POST",
      headers: { host, origin: "https://" + host, "content-type": "application/json" },
      body: JSON.stringify(input),
    }));
    expect(response.status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith({ ...input, language: "auto" });
  });

  it("rejects a foreign origin on Vercel even when forwarded headers or APP_URL match it", async () => {
    const origin = "https://elsewhere.example";
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_URL", origin);
    const response = await POST(new Request("http://localhost:3000/api/assistant", {
      method: "POST",
      headers: { host: "pondopath.vercel.app", origin, "x-forwarded-host": "elsewhere.example",
        "x-forwarded-proto": "https", "content-type": "application/json" },
      body: JSON.stringify({ task: "chat", question: "What should I do first?", history: [], expectedRevision: 1 }),
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("returns a validation error for broken JSON and counts actual bytes, not Content-Length", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('"' + "あ".repeat(6000) + '"')); controller.close(); } });
    const req = new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "content-length": "2" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves recoverable failures and hides upstream details", async () => {
    const body = JSON.stringify({ task: "explain", question: "Bakit?", expectedRevision: 1 });
    mocks.request.mockRejectedValueOnce(new Error("STALE_VERSION"));
    expect((await POST(request(body))).status).toBe(409);
    mocks.request.mockRejectedValueOnce(new Error("private credential and upstream details"));
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential");
  });

  it.each([["AI_PROVIDER_BUSY", 503], ["AI_TIMEOUT", 504]])("keeps provider failures distinct in the response: %s", async (code, status) => {
    const input = { task: "explain", question: "Bakit?", expectedRevision: 1 };
    mocks.request.mockRejectedValueOnce(new Error(code));
    const response = await POST(request(JSON.stringify(input)));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.code).toBe(code);
    expect(body).not.toHaveProperty("canTryBackup");
  });

  it("keeps app limits distinct and omits retry metadata", async () => {
    const input = { task: "explain", question: "Bakit?", expectedRevision: 1 };
    for (const [code, status] of [["AI_LIMIT", 429], ["AI_MEMBER_LIMIT", 429], ["STALE_VERSION", 409], ["AI_UNAVAILABLE", 503], ["AI_DEMO_ONLY", 503]] as const) {
      mocks.request.mockRejectedValueOnce(new Error(code));
      const response = await POST(request(JSON.stringify(input)));
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.code).toBe(code);
      expect(body).not.toHaveProperty("canTryBackup");
    }
  });

  it.each([[429, false], [503, true]] as const)("does not use OpenRouter after Gemini %i unless the request was quota-limited", async (status, hasBackup) => {
    const workspace = uiWorkspace();
    vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", workspace.business.id);
    vi.stubEnv("PONDOPATH_AI_DEMO_USER_ID", workspace.actor.userId);
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    if (hasBackup) {
      vi.stubEnv("OPENROUTER_API_KEY", "test-only");
      vi.stubEnv("OPENROUTER_MODEL", "test/model:free");
      vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
    }
    mocks.workspace.mockResolvedValue(workspace);
    mocks.rpc.mockResolvedValueOnce({ data: 1 });
    mocks.request.mockImplementation((await vi.importActual<typeof import("./ai")>("./ai")).requestAssistant);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);

    const input = { task: "explain", question: "Bakit?", expectedRevision: 1 };
    const primary = await POST(request(JSON.stringify(input)));
    expect(primary.status).toBe(503);
    const failure = await primary.json();
    expect(failure.code).toBe("AI_PROVIDER_BUSY");
    expect(failure).not.toHaveProperty("canTryBackup");
    expect(fetch.mock.calls.map(call => new URL(call[0]).hostname)).toEqual(["generativelanguage.googleapis.com"]);

    const backup = await POST(request(JSON.stringify({ ...input, attempt: "backup" })));
    expect(backup.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["reserve_ai_request"]);
  });

  it.each([["gemini", null], ["openrouter", 429], ["openrouter", 401]] as const)("validates chat through %s after Gemini status %s using one reservation", async (provider, geminiStatus) => {
    const workspace = uiWorkspace();
    const invoiceId = workspace.invoices[0].id;
    vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", workspace.business.id);
    vi.stubEnv("PONDOPATH_AI_DEMO_USER_ID", workspace.actor.userId);
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    vi.stubEnv("OPENROUTER_API_KEY", "test-backup");
    vi.stubEnv("OPENROUTER_MODEL", "test/model:free");
    vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
    mocks.workspace.mockResolvedValue(workspace);
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: workspace });
    mocks.request.mockImplementation((await vi.importActual<typeof import("./ai")>("./ai")).requestAssistant);
    const output = { kind: "answer", summary: "Review this invoice and check the cash plan.", factIds: ["cash-now"], recordIds: [invoiceId], draft: null };
    const fetch = vi.fn();
    if (provider === "openrouter") {
      mocks.rpc.mockResolvedValueOnce({ data: workspace });
      fetch.mockResolvedValueOnce(new Response(null, { status: geminiStatus! })).mockResolvedValueOnce(Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output), refusal: null } }],
        usage: { cost: 0 },
      }));
    } else {
      fetch.mockResolvedValueOnce(Response.json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }],
      }));
    }
    vi.stubGlobal("fetch", fetch);

    const response = await POST(request(JSON.stringify({ task: "chat", question: "What should I do first?", history: [], expectedRevision: 1 })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, provider: provider === "openrouter" ? "test-provider" : "google",
      proposal: { task: "chat", sourceRevision: 1, draft: null,
        facts: [{ id: "cash-now", value: "₱40,000.00" }], sources: [{ id: invoiceId, href: "/invoices/" + invoiceId }],
      },
    });
    expect(fetch.mock.calls.map(call => new URL(call[0]).hostname)).toEqual(
      provider === "openrouter" ? ["generativelanguage.googleapis.com", "openrouter.ai"] : ["generativelanguage.googleapis.com"],
    );
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(
      provider === "openrouter" ? ["reserve_ai_request", "workspace_snapshot", "workspace_snapshot"] : ["reserve_ai_request", "workspace_snapshot"],
    );
  });

  it.each([429, 401] as const)("stops before OpenRouter on Gemini %i when records changed", async status => {
    const workspace = uiWorkspace();
    vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", workspace.business.id);
    vi.stubEnv("PONDOPATH_AI_DEMO_USER_ID", workspace.actor.userId);
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    vi.stubEnv("OPENROUTER_API_KEY", "test-backup");
    vi.stubEnv("OPENROUTER_MODEL", "test/model:free");
    vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
    mocks.workspace.mockResolvedValue(workspace);
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...workspace, revision: 2 } });
    mocks.request.mockImplementation((await vi.importActual<typeof import("./ai")>("./ai")).requestAssistant);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);

    const response = await POST(request(JSON.stringify({ task: "chat", question: "What should I do first?", history: [], expectedRevision: 1 })));
    expect(response.status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a normal chat turn and enforces the byte limit on multibyte history", async () => {
    const chat = { task: "chat", question: "What should I do first?", history: [], expectedRevision: 1 };
    mocks.request.mockResolvedValueOnce({ proposal: { task: "chat" } });
    const success = await POST(request(JSON.stringify(chat)));
    expect(success.status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith({ ...chat, language: "auto" });
    const tooLarge = { ...chat, history: Array(3).fill({ question: "Earlier", answer: "あ".repeat(3000) }) };
    expect((await POST(request(JSON.stringify(tooLarge)))).status).toBe(413);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("rejects client-selected model, provider, URL or unsupported attempts before inference", async () => {
    const input = { task: "explain", question: "Bakit?", expectedRevision: 1 };
    for (const extra of [{ model: "test/paid" }, { provider: "test" }, { url: "https://other.example" }, { attempt: "auto" }]) {
      expect((await POST(request(JSON.stringify({ ...input, ...extra })))).status).toBe(400);
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
