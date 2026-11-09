import { timingSafeEqual } from "node:crypto";
import { syncDue } from "@/lib/server/google-sync";

const headers = { "Cache-Control": "no-store" };

/** Called by the scheduled job (Supabase Cron) with a server-only secret. Responds with counts only, never file content. */
export async function POST(request: Request) {
  const secret = process.env.GOOGLE_SYNC_CRON_SECRET ?? "";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (secret.length < 32 || given.length !== expected.length || !timingSafeEqual(given, expected))
    return Response.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401, headers });
  try { return Response.json({ ok: true, ...await syncDue(5) }, { headers }); }
  catch { return Response.json({ ok: false, code: "SYNC_UNAVAILABLE" }, { status: 503, headers }); }
}
