import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { aiConfig, callAiProvider } from "./ai-provider";
import { reminderTemplate } from "../domain/reminders";

const config = { key: "test-only", model: "openai/gpt-4.1-mini", provider: "openai" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("single pinned AI provider", () => {
  it("fails safely with the AI key removed while the manual reminder template still works", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => aiConfig()).toThrow("AI_UNAVAILABLE");
    expect(reminderTemplate({ contactName: "Demo contact", invoiceNumber: "TEST-001", outstandingCents: 2_000_000, dueDate: "2026-11-06", referenceDate: "2026-10-29" })).toContain("TEST-001");
  });
  it("pins the endpoint, forbids fallback routing and requests strict JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"Paliwanag","recordIds":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 4 } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await callAiProvider(config, [{ role: "system", content: "Read only" }], { type: "object", properties: {}, additionalProperties: false });
    expect(result.value).toEqual({ summary: "Paliwanag", recordIds: [] });
    const [url, options] = fetcher.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.provider).toMatchObject({ only: ["openai"], allow_fallbacks: false, require_parameters: true, data_collection: "deny" });
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result.usage.cost).toBeNull();
  });
  it.each(["not json", JSON.stringify({ error: { message: "private provider error" } }), JSON.stringify({ choices: [] })])("rejects malformed or provider-error envelopes without leaking details", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(callAiProvider(config, [], {})).rejects.toThrow("AI_UNAVAILABLE");
  });
  it("returns a recoverable timeout and never retries", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetcher);
    await expect(callAiProvider(config, [], {})).rejects.toThrow("AI_TIMEOUT");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
