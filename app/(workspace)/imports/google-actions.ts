"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { CommandError, type ActionResult } from "@/lib/domain/commands";
import { disconnectGoogle } from "@/lib/server/google-auth";

async function perform<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError(error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "SERVICE_UNAVAILABLE");
    return { ok: false, code: failure.code, message: Object.values(failure.fieldErrors ?? {})[0] ?? failure.message };
  }
}

/** Owner only: revoke Google access and stop every connected Drive file. History and proposals are kept. */
export async function disconnectGoogleAction() {
  return perform(async () => { await disconnectGoogle(); revalidatePath("/imports"); });
}
