"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { CommandError, type ActionResult } from "@/lib/domain/commands";
import { csvMappingSchema, mapCsv } from "@/lib/domain/imports";
import { requireActor } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

async function perform<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError("SERVICE_UNAVAILABLE");
    return { ok: false, code: failure.code, message: Object.values(failure.fieldErrors ?? {})[0] ?? failure.message };
  }
}
async function ownerClient(sourceId?: string) {
  const actor = await requireActor();
  if (actor.role !== "owner") throw new CommandError("FORBIDDEN");
  if (sourceId !== undefined && !z.uuid().safeParse(sourceId).success) throw new CommandError("VALIDATION_ERROR");
  return { actor, client: await createClient() };
}
function checked(error: { message: string } | null) {
  if (error) throw CommandError.fromDatabase(error.message);
  revalidatePath("/imports");
}
const newKey = () => randomBytes(32).toString("base64url");
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createSheetConnectionAction(label: string, sheetUrl: string) {
  return perform(async () => {
    const { client } = await ownerClient();
    const name = z.string().trim().min(1).max(200).safeParse(label);
    if (!name.success || typeof sheetUrl !== "string" || sheetUrl.length > 2048) throw new CommandError("VALIDATION_ERROR");
    if (!z.email().safeParse(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL).success)
      throw new CommandError("VALIDATION_ERROR", { connection: "Google Sheet connections are not configured. Ask your setup operator." });
    let settings;
    try {
      const url = new URL(sheetUrl);
      const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:\/(?:edit|view|preview))?\/?$/.exec(url.pathname);
      const gid = new URLSearchParams(url.hash.slice(1)).get("gid") ?? url.searchParams.get("gid") ?? "0";
      if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.username || url.password || url.port || !match || !/^\d{1,12}$/.test(gid)) throw new Error();
      settings = { spreadsheetId: match[1], gid, intervalMinutes: 10 };
    } catch { throw new CommandError("VALIDATION_ERROR", { sheet: "Paste the Google Sheet link with the selected tab." }); }
    const key = newKey();
    const { data, error } = await client.rpc("create_sheet_connection", { p_label: name.data, p_settings: settings, p_key_hash: hash(key) });
    checked(error);
    if (!z.uuid().safeParse(data).success) throw new CommandError("SERVICE_UNAVAILABLE");
    return { sourceId: data!, key };
  });
}
export async function saveConnectorMappingAction(sourceId: string, input: unknown) {
  return perform(async () => {
    const { actor, client } = await ownerClient(sourceId);
    const parsed = csvMappingSchema.safeParse(input);
    if (!parsed.success) throw new CommandError("VALIDATION_ERROR");
    const source = await client.from("intake_sources").select("connector_settings").eq("id", sourceId).eq("business_id", actor.businessId).eq("kind", "google_sheet").maybeSingle();
    if (source.error) throw new CommandError("SERVICE_UNAVAILABLE");
    if (!source.data) throw new CommandError("NOT_FOUND");
    const settings = z.object({ headers: z.array(z.string()).min(1).max(24) }).safeParse(source.data.connector_settings);
    if (!settings.success) throw new CommandError("VALIDATION_ERROR");
    const mapping = parsed.data;
    const customer = mapping.kind === "expense" ? null : await client.from("customers").select("id").eq("id", mapping.customerId).eq("business_id", actor.businessId).maybeSingle();
    if (customer?.error) throw new CommandError("SERVICE_UNAVAILABLE");
    try { mapCsv({ headers: settings.data.headers, rows: [] }, mapping, { customers: customer?.data ? [customer.data] : [], invoices: [], expenses: [], bindings: [] }); }
    catch { throw new CommandError("VALIDATION_ERROR", { mapping: "Check the mapping columns and choose a customer in this business." }); }
    checked((await client.rpc("save_connector_mapping", { p_source_id: sourceId, p_mapping: mapping })).error);
  });
}
export async function setConnectorPausedAction(sourceId: string, paused: boolean) {
  return perform(async () => {
    const { client } = await ownerClient(sourceId);
    if (typeof paused !== "boolean") throw new CommandError("VALIDATION_ERROR");
    checked((await client.rpc("set_connector_paused", { p_source_id: sourceId, p_paused: paused })).error);
  });
}
export async function replaceConnectorKeyAction(sourceId: string) {
  return perform(async () => {
    const { client } = await ownerClient(sourceId);
    const key = newKey();
    checked((await client.rpc("replace_connector_key", { p_source_id: sourceId, p_key_hash: hash(key) })).error);
    return { key };
  });
}
export async function disconnectConnectorAction(sourceId: string) {
  return perform(async () => {
    const { client } = await ownerClient(sourceId);
    checked((await client.rpc("disconnect_connector", { p_source_id: sourceId })).error);
  });
}
