import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { normalizeConnectorRows } from "@/lib/domain/connector-rows";
import { csvMappingSchema } from "@/lib/domain/imports";
import { labelRows, suggestAutoFields, suggestColumns, type AutoFields } from "@/lib/domain/reader";
import { requireActor } from "@/lib/server/auth";
import { ingestGoogleRead } from "@/lib/server/connector-intake";
import { accessToken, fileInfo, googleConfig, readFile } from "@/lib/server/google";
import { openToken } from "@/lib/server/token-safe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export { googleMessage } from "@/lib/domain/google-messages";

async function owner() {
  const actor = await requireActor();
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  return actor;
}
const dbError = (error: { message: string } | null) => { if (error) throw new Error(/^[A-Z_]{1,64}$/.test(error.message) ? error.message : "SERVICE_UNAVAILABLE"); };

/** A short-lived Google access token for this business. A refused sign-in marks the connection "needs reconnect". */
export async function businessAccessToken(businessId: string): Promise<string> {
  const admin = createAdminClient();
  const sealed = await admin.rpc("google_connection_token", { p_business: businessId });
  if (sealed.error || typeof sealed.data !== "string") throw new Error("GOOGLE_RECONNECT");
  try { return await accessToken(openToken(sealed.data)); }
  catch (error) {
    if (error instanceof Error && ["GOOGLE_RECONNECT", "TOKEN_UNREADABLE"].includes(error.message)) {
      await admin.rpc("google_connection_status", { p_business: businessId, p_status: "needs_reconnect" });
      throw new Error("GOOGLE_RECONNECT");
    }
    throw error;
  }
}

/** Owner only. Google's Picker runs in the browser with this short-lived token; the stored sign-in never leaves the server. */
export async function pickerSession() {
  const actor = await owner();
  const { clientId, pickerKey, projectNumber } = googleConfig();
  return { token: await businessAccessToken(actor.businessId), pickerKey, projectNumber, clientId };
}

/** Owner only. Only the file ID comes from the browser; name, type and size are read from Google. */
export async function connectGoogleFile(fileId: string): Promise<{ sourceId: string; tabs: string[]; tab: string | null }> {
  const actor = await owner();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new Error("FILE_ACCESS_LOST");
  const token = await businessAccessToken(actor.businessId);
  const info = await fileInfo(token, fileId);
  const { tabs, tab } = await readFile(token, info);
  const client = await createClient();
  const created = await client.rpc("create_google_file_connection", { p_label: info.name, p_settings: { fileId: info.id, name: info.name, mimeType: info.mimeType, tab } });
  dbError(created.error);
  return { sourceId: created.data as string, tabs, tab };
}

export type GoogleSetup = { headers: string[]; rows: string[][]; fields: AutoFields; labels: ReturnType<typeof labelRows>; tabs: string[]; tab: string | null };

/** Owner only. Stores the tab, records the first read (headers and samples) and returns the selector's preview, suggestions and labels. */
export async function readGoogleSetup(sourceId: string, tab: string): Promise<GoogleSetup> {
  const actor = await owner();
  if (!z.uuid().safeParse(sourceId).success || !tab || tab.length > 200) throw new Error("VALIDATION_ERROR");
  const client = await createClient();
  dbError((await client.rpc("set_google_file_tab", { p_source_id: sourceId, p_tab: tab })).error);
  const source = await createAdminClient().rpc("google_file_source", { p_source_id: sourceId });
  const parsed = z.object({ businessId: z.uuid(), status: z.string(), fileId: z.string() }).safeParse(source.data);
  if (source.error || !parsed.success || parsed.data.businessId !== actor.businessId) throw new Error("NOT_FOUND");
  const token = await businessAccessToken(actor.businessId);
  const info = await fileInfo(token, parsed.data.fileId);
  const { read, tabs, tab: readTab } = await readFile(token, info, tab);
  if (["awaiting_first_read", "awaiting_mapping"].includes(parsed.data.status))
    await ingestGoogleRead(sourceId, { runId: `google-setup-${new Date().toISOString()}-${randomBytes(3).toString("hex")}`, ...read });
  // Suggest roles from the headers first, so date columns can be turned from serial numbers into dates before labelling.
  const text = read.rows.slice(0, 20).map(row => row.map(value => value === null ? "" : String(value)));
  const fields = suggestAutoFields(suggestColumns(read.headers, text));
  const dateColumns = suggestColumns(read.headers, text).filter(item => item.role === "date" || item.role === "dueDate").map(item => item.header);
  let file;
  try { file = normalizeConnectorRows({ runId: "setup", ...read, rows: read.rows.slice(0, 100), rowNumbers: read.rowNumbers.slice(0, 100) }, { dateColumns }); }
  catch { throw new Error("FILE_UNREADABLE"); }
  const labels = labelRows(file, { externalId: fields.externalId ?? "", amount: fields.amount ?? "", overrides: {}, ...fields });
  return { headers: file.headers, rows: file.rows, fields, labels, tabs, tab: readTab };
}

/** Owner only. Saves the selector's `auto` mapping; the database re-checks ownership and size. */
export async function saveGoogleSetup(sourceId: string, input: unknown): Promise<void> {
  await owner();
  const mapping = csvMappingSchema.safeParse(input);
  if (!z.uuid().safeParse(sourceId).success || !mapping.success || mapping.data.kind !== "auto") throw new Error("VALIDATION_ERROR");
  const client = await createClient();
  dbError((await client.rpc("save_connector_mapping", { p_source_id: sourceId, p_mapping: mapping.data })).error);
}
