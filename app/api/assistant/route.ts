import { unstable_rethrow } from "next/navigation";
import { aiRequestSchema } from "@/lib/domain/ai";
import { requestAssistant } from "@/lib/server/ai";
import { readLimitedJson } from "@/lib/server/ai-provider";

export const maxDuration = 30;

const failures: Record<string, { status: number; message: string }> = {
  INVALID_REQUEST: { status: 400, message: "Review the selected task and required fields." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "That message is too long. Keep customer replies within 4,000 characters." },
  STALE_VERSION: { status: 409, message: "Records changed. Refresh the page before asking again; your message has not been saved." },
  AI_LIMIT: { status: 429, message: "The business's daily AI allowance is used. Manual forms and reminders remain available." },
  AI_TIMEOUT: { status: 504, message: "The assistant timed out. Your message is retained; try again or use the manual form." },
  AI_DEMO_ONLY: { status: 503, message: "AI is currently enabled only for fictional demo workspaces." },
  AI_UNAVAILABLE: { status: 503, message: "The assistant is unavailable or returned details that need a manual check. Your records have not changed." },
};
function failure(code: string) {
  const detail = failures[code] ?? failures.AI_UNAVAILABLE;
  return Response.json({ ok: false, code: failures[code] ? code : "AI_UNAVAILABLE", message: detail.message }, { status: detail.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const trustedOrigin = process.env.APP_URL;
  if (!origin || !trustedOrigin || origin !== new URL(trustedOrigin).origin) return Response.json({ ok: false, code: "FORBIDDEN", message: "Open the assistant from your signed-in PondoPath workspace." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return failure("INVALID_REQUEST");
  try {
    const input = aiRequestSchema.safeParse(await readLimitedJson(request, 16_384));
    if (!input.success) return failure("INVALID_REQUEST");
    const result = await requestAssistant(input.data);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SyntaxError || error instanceof TypeError) return failure("INVALID_REQUEST");
    return failure(error instanceof Error ? error.message : "AI_UNAVAILABLE");
  }
}
