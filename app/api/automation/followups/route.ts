import { unstable_rethrow } from "next/navigation";
import { authorizeAutomation, automationRequestSchema, runAutomation } from "@/lib/server/automation";
import { readLimitedJson } from "@/lib/server/ai-provider";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    const businessId = authorizeAutomation(request.headers.get("authorization"));
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("INVALID_REQUEST");
    const input = automationRequestSchema.safeParse(await readLimitedJson(request, 65_536));
    if (!input.success) throw new Error("INVALID_REQUEST");
    return Response.json({ ok: true, ...await runAutomation(businessId, input.data) as object }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof SyntaxError || error instanceof TypeError ? "INVALID_REQUEST" : error instanceof Error ? error.message : "AUTOMATION_UNAVAILABLE";
    const status = ({ UNAUTHENTICATED: 401, INVALID_REQUEST: 400, PAYLOAD_TOO_LARGE: 413, LIMIT_REACHED: 409 } as Record<string, number>)[code] ?? 503;
    return Response.json({ ok: false, code: status === 503 ? "AUTOMATION_UNAVAILABLE" : code }, { status, headers });
  }
}
