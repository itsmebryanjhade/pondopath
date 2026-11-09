import { afterEach, describe, expect, it, vi } from "vitest";
import { aiBackupConfig, aiConfig, callAiProvider } from "./ai-provider";
import { reminderTemplate } from "../domain/reminders";

vi.mock("server-only", () => ({}));

const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
const answer = { summary: "Paliwanag", recordIds: [] };
const messages = [{ role: "system" as const, content: "Read only" }, { role: "user" as const, content: "Fictional records" }];
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: { kind: { type: "string", const: "answer", maxLength: 12 }, records: { type: "array", items: { type: "string", format: "uuid" } } },
  required: ["kind", "records"],
  additionalProperties: false,
};
function configure() {
  vi.stubEnv("GEMINI_API_KEY", "gemini-test-only");
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-only");
  vi.stubEnv("OPENROUTER_MODEL", "test/model:free");
  vi.stubEnv("OPENROUTER_PROVIDER", "test-provider");
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Gemini and OpenRouter transport", () => {
  it("uses Gemini once by default and sends a bounded supported schema", async () => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [
        { thought: true, text: "private reasoning" }, { text: JSON.stringify(answer) },
      ] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
    }));
    vi.stubGlobal("fetch", fetcher);
    expect(await callAiProvider(aiConfig(), messages, schema)).toEqual({
      value: answer, usage: { promptTokens: 10, completionTokens: 4, cost: null },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(geminiUrl);
    expect(options).toMatchObject({ method: "POST", cache: "no-store", headers: { "x-goog-api-key": "gemini-test-only" } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({
      systemInstruction: { parts: [{ text: "Read only" }] },
      contents: [{ role: "user", parts: [{ text: "Fictional records" }] }],
      generationConfig: { maxOutputTokens: 1800, candidateCount: 1 },
    });
    expect(JSON.parse(options.body).generationConfig.responseFormat.text).toEqual({
      mimeType: "APPLICATION_JSON",
      schema: {
        type: "object", properties: { kind: { type: "string", enum: ["answer"] }, records: { type: "array", items: { type: "string" } } },
        required: ["kind", "records"], additionalProperties: false,
      },
    });
  });

  it("uses the existing OpenRouter model and provider with a strict, zero-cost route", async () => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer), refusal: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0 },
    }));
    vi.stubGlobal("fetch", fetcher);
    expect(await callAiProvider(aiBackupConfig()!, messages, schema)).toEqual({
      value: answer, usage: { promptTokens: 10, completionTokens: 4, cost: 0 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer openrouter-test-only" });
    expect(JSON.parse(options.body)).toMatchObject({
      model: "test/model:free", temperature: 0, max_tokens: 1800,
      provider: { only: ["test-provider"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", max_price: { prompt: 0, completion: 0, request: 0 } },
      response_format: { type: "json_schema", json_schema: { strict: true, schema: {
        type: "object", properties: { kind: { type: "string", enum: ["answer"] }, records: { type: "array", items: { type: "string" } } },
        required: ["kind", "records"], additionalProperties: false,
      } } },
    });
  });

  it("requires a Gemini key and keeps OpenRouter optional while manual reminders work", () => {
    configure();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => aiConfig()).toThrow("AI_UNAVAILABLE");
    vi.stubEnv("OPENROUTER_API_KEY", "  ");
    expect(aiBackupConfig()).toBeNull();
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-only");
    for (const model of ["test/paid", "openrouter/free", "", "https://example.test:free"]) {
      vi.stubEnv("OPENROUTER_MODEL", model);
      expect(aiBackupConfig()).toBeNull();
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(reminderTemplate({ contactName: "Demo contact", invoiceNumber: "TEST-001", outstandingCents: 2_000_000, dueDate: "2026-11-06", referenceDate: "2026-10-29" })).toContain("TEST-001");
  });

  it("skips an OpenRouter call if the shared deadline already expired", async () => {
    configure();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const signal = AbortSignal.abort(new DOMException("Deadline expired", "TimeoutError"));
    await expect(callAiProvider(aiBackupConfig()!, messages, schema, signal)).rejects.toThrow("AI_TIMEOUT");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([["length", null], ["stop", "Refused"]])("rejects an incomplete OpenRouter result (%s)", async (finish_reason, refusal) => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      choices: [{ finish_reason, message: { content: JSON.stringify(answer), refusal } }],
    })));
    await expect(callAiProvider(aiBackupConfig()!, messages, schema)).rejects.toThrow("AI_UNAVAILABLE");
  });

  it.each([429, 500, 503])("classifies upstream %i as retryable and never switches providers itself", async status => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(new Response("private provider details", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(callAiProvider(aiConfig(), messages, schema)).rejects.toThrow(/^AI_PROVIDER_BUSY$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([302, 400, 401, 403])("rejects upstream %i without requesting a backup", async status => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(callAiProvider(aiConfig(), messages, schema)).rejects.toThrow(/^AI_UNAVAILABLE$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    "not json", Uint8Array.of(0xff), JSON.stringify({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }),
    JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
    JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "" }] } }] }),
    "x".repeat(65_537),
  ])("rejects malformed, blocked, truncated, empty or oversized replies", async body => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(callAiProvider(aiConfig(), messages, schema)).rejects.toThrow(/^AI_UNAVAILABLE$/);
  });

  it("offers retry for a connection dropped while reading the reply", async () => {
    configure();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new TypeError("private socket failure")); },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", fetcher);
    await expect(callAiProvider(aiConfig(), messages, schema)).rejects.toThrow(/^AI_PROVIDER_BUSY$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new DOMException("private timeout", "TimeoutError"), "AI_TIMEOUT"],
    [new TypeError("private network failure"), "AI_PROVIDER_BUSY"],
  ] as const)("normalizes transport failures without sending a second request", async (error, expected) => {
    configure();
    const fetcher = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetcher);
    await expect(callAiProvider(aiConfig(), messages, schema)).rejects.toThrow(expected);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
