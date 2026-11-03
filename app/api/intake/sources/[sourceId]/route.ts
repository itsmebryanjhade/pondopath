import { unstable_rethrow } from "next/navigation";
import { CommandError } from "@/lib/domain/commands";
import { stageIntakeBatch } from "@/lib/server/intake";
import { readLimitedJson } from "@/lib/server/ai-provider";

// Session-authenticated intake only. External connector credentials are a separate adapter task.
export async function POST(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const origin = process.env.APP_URL;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin) return Response.json({ ok: false, code: "FORBIDDEN" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return Response.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400, headers });
  try {
    const { sourceId } = await context.params;
    const input = await readLimitedJson(request, 524_288);
    const data = await stageIntakeBatch(sourceId, input);
    return Response.json({ ok: true, data }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError("VALIDATION_ERROR");
    const status = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : failure.code === "FORBIDDEN" ? 403 : failure.code === "NOT_FOUND" ? 404 : failure.code === "SERVICE_UNAVAILABLE" ? 503 : 400;
    return Response.json({ ok: false, code: failure.code, message: failure.message }, { status, headers });
  }
}
