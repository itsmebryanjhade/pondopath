import { z } from "zod";
import { connectorReadSchema } from "@/lib/domain/connector-rows";
import { ingestConnectorRead } from "@/lib/server/connector-intake";
import { readLimitedJson } from "@/lib/server/ai-provider";

export async function POST(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const error = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers });
  const bearer = /^Bearer ([A-Za-z0-9_-]{32,200})$/i.exec(request.headers.get("authorization") ?? "");
  if (!bearer) return error(401, "UNAUTHENTICATED");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return error(400, "INVALID_REQUEST");
  const { sourceId } = await context.params;
  if (!z.uuid().safeParse(sourceId).success) return error(400, "INVALID_REQUEST");
  let input;
  try { input = await readLimitedJson(request, 524_288); }
  catch (failure) { return failure instanceof Error && failure.message === "PAYLOAD_TOO_LARGE" ? error(413, "PAYLOAD_TOO_LARGE") : error(400, "INVALID_REQUEST"); }
  const parsed = connectorReadSchema.safeParse(input);
  if (!parsed.success) return error(400, "INVALID_REQUEST");
  try {
    const summary = await ingestConnectorRead(sourceId, bearer[1], parsed.data);
    return Response.json({ ok: true, summary }, { headers });
  } catch (failure) {
    const code = failure instanceof Error ? failure.message : "";
    if (code === "PAYLOAD_TOO_LARGE") return error(413, code);
    if (code === "UNAUTHENTICATED") return error(401, code);
    if (code === "INVALID_REQUEST") return error(400, "INVALID_REQUEST");
    return error(503, "CONNECTOR_UNAVAILABLE");
  }
}
