import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { admin, createTestBusiness, disposeTestBusiness, type TestBusiness } from "./helpers";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => state.cookies.set(name, value) }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
import { POST } from "../../app/api/assistant/route";

let fixture: TestBusiness;
const nativeFetch = globalThis.fetch;
beforeAll(async () => {
  fixture = await createTestBusiness();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.TEST_SUPABASE_URL!);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.TEST_SUPABASE_PUBLISHABLE_KEY!);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("PONDOPATH_AI_DEMO_BUSINESS_ID", fixture.id);
  vi.stubEnv("GEMINI_API_KEY", "mocked-provider-only");
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  const client = createServerClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => state.cookies.set(name, value)) } });
  expect((await client.auth.signInWithPassword(fixture.accounts.finance)).error).toBeNull();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { vi.unstubAllEnvs(); if (fixture) await disposeTestBusiness(fixture); });
const request = (extra = {}) => new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ task: "explain", question: "Ano ang cash plan?", expectedRevision: 0, ...extra }) });

const chatRequest = (extra = {}) => request({ task: "chat", history: [], ...extra });
const chatAnswer = { kind: "answer", summary: "Use the cash plan and review the unpaid invoice.", factIds: [], recordIds: [], draft: null };

function mockProviderFetch(respond: (provider: "gemini" | "openrouter") => Response | Promise<Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const target = new URL(url instanceof Request ? url.url : url);
    if (target.href === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent") return respond("gemini");
    if (target.href === "https://openrouter.ai/api/v1/chat/completions") return respond("openrouter");
    if (target.origin === process.env.TEST_SUPABASE_URL) return nativeFetch(url, init);
    throw new Error("Unexpected fetch in assistant test");
  });
}

function geminiReply(value: unknown) {
  return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

async function countAttempts() {
  const usage = await admin.from("ai_usage").select("request_count").eq("business_id", fixture.id);
  expect(usage.error).toBeNull();
  return usage.data!.reduce((count, row) => count + row.request_count, 0);
}

describe("real authenticated context with only model transport mocked", () => {
  it("rejects foreign record IDs before sending anything to a provider", async () => {
    const outbound = vi.fn(() => { throw new Error("Unexpected provider request"); });
    mockProviderFetch(outbound);
    expect((await POST(request({ invoiceId: "10000000-0000-4000-8000-000000000099" }))).status).toBe(503);
    expect((await POST(chatRequest({ context: { page: "invoices", record: { kind: "invoice", id: "10000000-0000-4000-8000-000000000099" } } }))).status).toBe(503);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("holds invented sources for review, consumes the reserved attempt and leaves money unchanged", async () => {
    mockProviderFetch(provider => {
      expect(provider).toBe("gemini");
      return geminiReply({ summary: "Unsupported", recordIds: ["10000000-0000-4000-8000-000000000099"] });
    });
    expect((await POST(request())).status).toBe(503);
    expect(await countAttempts()).toBe(1);
    const movements = await admin.from("cash_movements").select("id").eq("business_id", fixture.id);
    expect(movements.data).toEqual([]);
  });

  it("answers a signed-in follow-up using current facts and links without writing payments", async () => {
    const history = [{ question: "Ano ang plano?", answer: "Tingnan ang cash plan." }];
    const outbound = vi.fn(() => geminiReply({
      ...chatAnswer, factIds: ["cash-now"], recordIds: [fixture.invoiceId],
    }));
    mockProviderFetch(outbound);
    const response = await POST(chatRequest({ history }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, provider: "google",
      proposal: { task: "chat", sourceRevision: 0, draft: null,
        facts: [{ id: "cash-now", value: "₱40,000.00" }],
        sources: [{ id: fixture.invoiceId, href: "/invoices/" + fixture.invoiceId }],
      },
    });
    expect(outbound).toHaveBeenCalledExactlyOnceWith("gemini");
    const movements = await admin.from("cash_movements").select("id").eq("business_id", fixture.id);
    expect(movements.error).toBeNull();
    expect(movements.data).toEqual([]);
  });

  it("clarifies an unspecified invoice locally without reserving an attempt", async () => {
    const outbound = vi.fn(() => { throw new Error("Unexpected provider request"); });
    mockProviderFetch(outbound);
    const before = await countAttempts();
    const response = await POST(chatRequest({ intent: "draft_reminder", question: "Draft a reminder" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, proposal: { kind: "clarify", draft: null }, usage: null });
    expect(outbound).not.toHaveBeenCalled();
    expect(await countAttempts()).toBe(before);
  });

  it("keeps a mismatched extracted amount or date in review even with an exact source quote", async () => {
    const reply = "PHP 20000 on 2026-11-06";
    mockProviderFetch(() => geminiReply({
      invoiceId: fixture.invoiceId, amountCents: 1_000_000, date: "2026-11-07",
      reason: null, needsReview: false, sourceQuotes: [reply], issues: [],
    }));
    const response = await POST(request({ task: "extract_reply", question: undefined, invoiceId: fixture.invoiceId, reply }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, proposal: { task: "extract_reply", needsReview: true, amountCents: null, date: null } });
  });

  it("uses the existing allowance once and rejects a backup attempt", async () => {
    const outbound = vi.fn(() => new Response(null, { status: 429 }));
    mockProviderFetch(outbound);
    const before = await countAttempts();
    const primary = await POST(chatRequest());
    expect(primary.status).toBe(503);
    const failure = await primary.json();
    expect(failure.code).toBe("AI_PROVIDER_BUSY");
    expect(failure).not.toHaveProperty("canTryBackup");

    const backup = await POST(chatRequest({ attempt: "backup" }));
    expect(backup.status).toBe(400);
    expect(outbound).toHaveBeenCalledExactlyOnceWith("gemini");
    expect(await countAttempts()).toBe(before + 1);
  });

  it("uses the existing OpenRouter route once and holds incorrect amounts and dates for review", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "mocked-provider-only");
    vi.stubEnv("OPENROUTER_MODEL", "test/model:free");
    vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
    const reply = "PHP 20000 on 2026-11-06";
    const output = {
      invoiceId: fixture.invoiceId, amountCents: 1_000_000, date: "2026-11-07",
      reason: null, needsReview: false, sourceQuotes: [reply], issues: [],
    };
    const outbound = vi.fn()
      .mockReturnValueOnce(new Response(null, { status: 429 }))
      .mockReturnValueOnce(Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
        usage: { cost: 0 },
      }));
    mockProviderFetch(outbound);
    try {
      const before = await countAttempts();
      const response = await POST(request({ task: "extract_reply", question: undefined, invoiceId: fixture.invoiceId, reply }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true, provider: "test-provider",
        proposal: { task: "extract_reply", needsReview: true, amountCents: null, date: null },
      });
      expect(outbound.mock.calls).toEqual([["gemini"], ["openrouter"]]);
      expect(await countAttempts()).toBe(before + 1);
      const movements = await admin.from("cash_movements").select("id").eq("business_id", fixture.id);
      expect(movements.error).toBeNull();
      expect(movements.data).toEqual([]);
    } finally {
      vi.stubEnv("OPENROUTER_API_KEY", undefined);
      vi.stubEnv("OPENROUTER_MODEL", undefined);
      vi.stubEnv("OPENROUTER_PROVIDER", undefined);
    }
  });

  it("rejects a chat proposal if records change during the external request", async () => {
    mockProviderFetch(async provider => {
      expect(provider).toBe("gemini");
      expect((await admin.from("businesses").update({ revision: 1 }).eq("id", fixture.id)).error).toBeNull();
      return geminiReply(chatAnswer);
    });
    expect((await POST(chatRequest())).status).toBe(409);
  });

  it("discards a chat reply if the requesting fixture member loses access during inference", async () => {
    mockProviderFetch(async provider => {
      expect(provider).toBe("gemini");
      const removed = await admin.from("memberships").delete()
        .eq("business_id", fixture.id).eq("user_id", fixture.accounts.finance.id);
      expect(removed.error).toBeNull();
      return geminiReply(chatAnswer);
    });
    const response = await POST(chatRequest({ expectedRevision: 1 }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "AI_UNAVAILABLE" });
  });
});
