import "server-only";
import { z } from "zod";

export type AiConfig = { key: string; model: string; provider: string };
export function aiConfig(): AiConfig {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();
  const provider = process.env.OPENROUTER_PROVIDER?.trim();
  if (!key || !model || !provider) throw new Error("AI_UNAVAILABLE");
  return { key, model, provider };
}

const envelope = z.object({
  error: z.unknown().optional(),
  choices: z.array(z.object({ finish_reason: z.string().optional(), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), cost: z.number().finite().nonnegative().optional() }).optional(),
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
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function callAiProvider(config: AiConfig, messages: { role: "system" | "user"; content: string }[], schema: unknown) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, temperature: 0, max_tokens: 1800,
        provider: { only: [config.provider], allow_fallbacks: false, require_parameters: true, data_collection: "deny" },
        response_format: { type: "json_schema", json_schema: { name: "cash_plan_assistance", strict: true, schema } },
      }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("AI_UNAVAILABLE"); }
    const result = envelope.parse(await readLimitedJson(response, 65_536));
    const choice = result.choices[0];
    if (result.error || choice.message.refusal || (choice.finish_reason && choice.finish_reason !== "stop")) throw new Error("AI_UNAVAILABLE");
    return { value: JSON.parse(choice.message.content) as unknown, usage: { promptTokens: result.usage?.prompt_tokens ?? null, completionTokens: result.usage?.completion_tokens ?? null, cost: result.usage?.cost ?? null } };
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new Error("AI_TIMEOUT");
    throw new Error("AI_UNAVAILABLE");
  }
}
