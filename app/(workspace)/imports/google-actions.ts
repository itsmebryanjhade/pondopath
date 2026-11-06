"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { CommandError, type ActionResult } from "@/lib/domain/commands";
import { disconnectGoogle } from "@/lib/server/google-auth";
import { connectGoogleFile, googleMessage, pickerSession, readGoogleSetup, saveGoogleSetup } from "@/lib/server/google-files";

async function perform<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) {
    unstable_rethrow(error);
    if (error instanceof CommandError) return { ok: false, code: error.code, message: Object.values(error.fieldErrors ?? {})[0] ?? error.message };
    // Google and connector codes become owner-facing wording; nothing technical or file content reaches the browser.
    const code = error instanceof Error ? error.message : "";
    return { ok: false, code: code === "FORBIDDEN" ? "FORBIDDEN" : code === "VALIDATION_ERROR" ? "VALIDATION_ERROR" : "SERVICE_UNAVAILABLE", message: code === "VALIDATION_ERROR" ? "Check the setup and try again." : googleMessage(code) };
  }
}

/** Owner only: revoke Google access and stop every connected Drive file. History and proposals are kept. */
export async function disconnectGoogleAction() {
  return perform(async () => { await disconnectGoogle(); revalidatePath("/imports"); });
}

export async function pickerSessionAction() { return perform(pickerSession); }
export async function createGoogleFileAction(fileId: string) {
  return perform(async () => { const result = await connectGoogleFile(fileId); revalidatePath("/imports"); return result; });
}
export async function readGoogleSetupAction(sourceId: string, tab: string) { return perform(() => readGoogleSetup(sourceId, tab)); }
export async function saveGoogleSetupAction(sourceId: string, mapping: unknown) {
  return perform(async () => { await saveGoogleSetup(sourceId, mapping); revalidatePath("/imports"); });
}
