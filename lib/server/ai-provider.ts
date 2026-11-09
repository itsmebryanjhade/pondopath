import "server-only";
import { z } from "zod";

export type AiConfig = { kind: "gemini" | "openrouter"; key: string; model: string; provider: string };

export function aiConfig(attempt: "primary" | "backup" = "primary"): AiConfig {
  if (attempt === "primary") {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("AI_UNAVAILABLE");
    return { kind: "gemini", key, model: "gemini-3.1-flash-lite", provider: "google" };
  }
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();
  const provider = process.env.OPENROUTER_PROVIDER?.trim();
  if (!key || !model || !/^[\w.-]+\/[\w.-]+:free$/.test(model) || !provider || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(provider)) {
    throw new Error("AI_UNAVAILABLE");
  }
  return { kind: "openrouter", key, model, provider };
}

const tokenCount = z.number().int().nonnegative().optional();
const geminiEnvelope = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.literal("STOP"),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
  })).min(1),
  usageMetadata: z.object({ promptTokenCount: tokenCount, candidatesTokenCount: tokenCount }).optional(),
});
const openRouterEnvelope = z.object({
  error: z.unknown().optional(),
  choices: z.array(z.object({ finish_reason: z.string().optional(), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).min(1),
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount, cost: z.number().finite().nonnegative().optional() }).optional(),
});

export async function readLimitedJson(request: Request | Response, maximum: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) throw new Error("PAYLOAD_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("INVALID_REQUEST");
    }
    return JSON.parse(text);
  } finally { await reader.cancel().catch(() => {}); }
}

// Project to Gemini's schema subset. The full Zod validators still check the reply.
function geminiSchema(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const keywords = ["type", "title", "description", "enum", "required", "minimum", "maximum", "minItems", "maxItems", "additionalProperties"];
  const result = Object.fromEntries(keywords.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
  if (Object.hasOwn(source, "const")) result.enum = [source.const];
  if (source.properties && typeof source.properties === "object") {
    result.properties = Object.fromEntries(Object.entries(source.properties).map(([key, child]) => [key, geminiSchema(child)]));
  }
  if (source.items) result.items = geminiSchema(source.items);
  const variants = source.anyOf ?? source.oneOf;
  if (Array.isArray(variants)) result.anyOf = variants.map(geminiSchema);
  return result;
}

function providerTransportError(error: unknown, signal: AbortSignal) {
  if (signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
    return new Error("AI_TIMEOUT");
  }
  return new Error(error instanceof TypeError ? "AI_PROVIDER_BUSY" : "AI_UNAVAILABLE");
}

async function fetchProviderJson(url: string, headers: Record<string, string>, body: object) {
  const signal = AbortSignal.timeout(20_000);
  const payload = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "manual", signal,
      headers: { "Content-Type": "application/json", ...headers }, body: payload,
    });
  } catch (error) {
    throw providerTransportError(error, signal);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 408) throw new Error("AI_TIMEOUT");
    throw new Error(response.status === 429 || response.status >= 500 ? "AI_PROVIDER_BUSY" : "AI_UNAVAILABLE");
  }
  try {
    return await readLimitedJson(response, 65_536);
  } catch (error) {
    throw providerTransportError(error, signal);
  }
}

type AiMessage = { role: "system" | "user"; content: string };

export async function callAiProvider(config: AiConfig, messages: AiMessage[], schema: unknown) {
  const gemini = config.kind === "gemini";
  const json = gemini
    ? await fetchProviderJson(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, { "x-goog-api-key": config.key }, {
      systemInstruction: { parts: messages.filter(message => message.role === "system").map(message => ({ text: message.content })) },
      contents: [{ role: "user", parts: messages.filter(message => message.role === "user").map(message => ({ text: message.content })) }],
      generationConfig: {
        maxOutputTokens: 1800, candidateCount: 1,
        responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: geminiSchema(schema) } },
      },
    })
    : await fetchProviderJson("https://openrouter.ai/api/v1/chat/completions", { Authorization: `Bearer ${config.key}` }, {
      model: config.model, messages, temperature: 0, max_tokens: 1800,
      provider: { only: [config.provider], allow_fallbacks: false, require_parameters: true, data_collection: "deny", max_price: { prompt: 0, completion: 0, request: 0 } },
      response_format: { type: "json_schema", json_schema: { name: "cash_plan_assistance", strict: true, schema } },
    });
  try {
    if (gemini) {
      const result = geminiEnvelope.parse(json);
      if (result.promptFeedback?.blockReason) throw new Error("AI_UNAVAILABLE");
      const content = result.candidates[0].content.parts.filter(part => !part.thought).map(part => part.text ?? "").join("");
      return { value: JSON.parse(content) as unknown, usage: {
        promptTokens: result.usageMetadata?.promptTokenCount ?? null,
        completionTokens: result.usageMetadata?.candidatesTokenCount ?? null, cost: null,
      } };
    }
    const result = openRouterEnvelope.parse(json);
    const choice = result.choices[0];
    if (result.error || choice.message.refusal || (choice.finish_reason && choice.finish_reason !== "stop")) throw new Error("AI_UNAVAILABLE");
    return { value: JSON.parse(choice.message.content) as unknown, usage: {
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null, cost: result.usage?.cost ?? null,
    } };
  } catch {
    throw new Error("AI_UNAVAILABLE");
  }
}
