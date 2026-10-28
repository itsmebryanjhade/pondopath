"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  CommandError,
  workspaceCommandSchema,
  type ActionResult,
  type CommandResult,
} from "@/lib/domain/commands";
import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { runCommand } from "@/lib/server/commands";

export async function executeWorkspaceAction(
  command: unknown,
): Promise<ActionResult<CommandResult>> {
  const parsed = workspaceCommandSchema.safeParse(command);
  if (!parsed.success)
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Check the required fields, amounts and dates.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      ),
    };
  try {
    const data = await runCommand(parsed.data);
    revalidatePath("/(workspace)", "layout");
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError("SERVICE_UNAVAILABLE");
    return {
      ok: false,
      code: failure.code,
      message: failure.message,
      fieldErrors: failure.fieldErrors,
    };
  }
}

export async function getApprovedReminderText(id: string): Promise<ActionResult<{ text: string }>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success)
    return { ok: false, code: "VALIDATION_ERROR", message: "This reminder is unavailable." };
  try {
    await requireActor();
    const client = await createClient();
    const { data, error } = await client.rpc("get_approved_reminder_text", { p_id: parsed.data });
    if (error) throw CommandError.fromDatabase(error.message);
    const result = data as { text: string | null; stale: boolean } | null;
    if (result?.stale) {
      revalidatePath("/invoices/[id]", "page");
      revalidatePath("/overview");
      return {
        ok: false,
        code: "STALE_VERSION",
        message: "The invoice, contact, or payment plan changed. The approval was cleared; review the draft again.",
      };
    }
    if (!result?.text)
      return { ok: false, code: "VALIDATION_ERROR", message: "Only a currently approved reminder can be copied." };
    return { ok: true, data: { text: result.text } };
  } catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError("SERVICE_UNAVAILABLE");
    return { ok: false, code: failure.code, message: failure.message };
  }
}
