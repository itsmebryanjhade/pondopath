import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { ingestGoogleRead, type ConnectorRunSummary } from "@/lib/server/connector-intake";
import { fileInfo, readFile } from "@/lib/server/google";
import { businessAccessToken } from "@/lib/server/google-files";
import { createAdminClient } from "@/lib/supabase/admin";

const sourceSchema = z.object({ businessId: z.uuid(), status: z.string(), fileId: z.string(), tab: z.string().nullable().optional() });
const KNOWN = new Set(["GOOGLE_RECONNECT", "FILE_ACCESS_LOST", "FILE_TOO_LARGE", "FILE_NOT_SUPPORTED", "FILE_UNREADABLE", "GOOGLE_UNAVAILABLE", "GOOGLE_NOT_CONFIGURED"]);

async function source(sourceId: string) {
  const result = await createAdminClient().rpc("google_file_source", { p_source_id: sourceId });
  const parsed = sourceSchema.safeParse(result.data);
  if (result.error || !parsed.success) throw new Error("NOT_FOUND");
  return parsed.data;
}

/** Reads one Drive file and sends it through the Google door. Read failures are recorded as failed runs, never as content. */
export async function syncGoogleFile(sourceId: string): Promise<ConnectorRunSummary> {
  const file = await source(sourceId);
  const runId = `google-${new Date().toISOString()}-${randomBytes(3).toString("hex")}`;
  try {
    const token = await businessAccessToken(file.businessId);
    const info = await fileInfo(token, file.fileId);
    const { read } = await readFile(token, info, file.tab ?? undefined);
    return await ingestGoogleRead(sourceId, { runId, ...read });
  } catch (error) {
    const code = error instanceof Error && KNOWN.has(error.message) ? error.message : "READ_FAILED";
    return ingestGoogleRead(sourceId, { runId, error: code });
  }
}

/** Claims up to `limit` due files (10 minutes since the last read, not leased) and syncs each; one failure never stops the rest. */
export async function syncDue(limit = 5, businessId?: string): Promise<{ synced: number; failed: number }> {
  const claimed = await createAdminClient().rpc("google_claim_due", { p_limit: limit, ...(businessId ? { p_business: businessId } : {}) });
  if (claimed.error || !Array.isArray(claimed.data)) throw new Error("GOOGLE_UNAVAILABLE");
  let synced = 0, failed = 0;
  for (const id of claimed.data as string[]) {
    try { if ((await syncGoogleFile(id)).result === "failed") failed++; else synced++; }
    catch { failed++; }
  }
  return { synced, failed };
}

/** Started after the Review Inbox renders: catches up this business's due files without delaying the page. */
export async function syncBusinessIfDue(businessId: string): Promise<void> {
  try { await syncDue(5, businessId); } catch { /* The next cron call or Sync now tries again. */ }
}

/** Sync now: any member of the business may read its connected files; the lease stops overlapping runs. */
export async function syncNow(sourceId: string): Promise<ConnectorRunSummary> {
  const actor = await requireActor();
  if (!z.uuid().safeParse(sourceId).success) throw new Error("NOT_FOUND");
  const file = await source(sourceId);
  if (file.businessId !== actor.businessId) throw new Error("NOT_FOUND");
  const claimed = await createAdminClient().rpc("google_claim_source", { p_source_id: sourceId });
  if (claimed.error) throw new Error("GOOGLE_UNAVAILABLE");
  if (claimed.data !== true) throw new Error("SYNC_IN_PROGRESS");
  return syncGoogleFile(sourceId);
}
