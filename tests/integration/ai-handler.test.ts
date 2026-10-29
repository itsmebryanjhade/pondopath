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
  vi.stubEnv("OPENROUTER_API_KEY", "mocked-provider-only");
  vi.stubEnv("OPENROUTER_MODEL", "test-model");
  vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
  const client = createServerClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => state.cookies.set(name, value)) } });
  expect((await client.auth.signInWithPassword(fixture.accounts.finance)).error).toBeNull();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { vi.unstubAllEnvs(); if (fixture) await disposeTestBusiness(fixture); });
const request = (extra = {}) => new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ task: "explain", question: "Ano ang cash plan?", expectedRevision: 0, ...extra }) });

describe("real authenticated context with only model transport mocked", () => {
  it("rejects foreign record IDs before sending anything to a provider", async () => {
    const outbound = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url).startsWith("https://openrouter.ai/")) { outbound(); throw new Error("Unexpected provider request"); }
      return nativeFetch(url, init);
    });
    expect((await POST(request({ invoiceId: "10000000-0000-4000-8000-000000000099" }))).status).toBe(503);
    expect(outbound).not.toHaveBeenCalled();
  });
  it("holds invented sources for review, consumes the reserved attempt and leaves money unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url).startsWith("https://openrouter.ai/")) return Promise.resolve(Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Unsupported", recordIds: ["10000000-0000-4000-8000-000000000099"] }) } }] }));
      return nativeFetch(url, init);
    });
    expect((await POST(request())).status).toBe(503);
    const usage = await admin.from("ai_usage").select("request_count").eq("business_id", fixture.id);
    expect(usage.data?.[0].request_count).toBe(1);
    const movements = await admin.from("cash_movements").select("id").eq("business_id", fixture.id);
    expect(movements.data).toEqual([]);
  });
  it("rejects a proposal if records change during the external request", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://openrouter.ai/")) {
        expect((await admin.from("businesses").update({ revision: 1 }).eq("id", fixture.id)).error).toBeNull();
        return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Expected pa lang ang payment.", recordIds: [] }) } }] });
      }
      return nativeFetch(url, init);
    });
    expect((await POST(request())).status).toBe(409);
  });
});
