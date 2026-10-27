"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  CommandError,
  workspaceCommandSchema,
  type ActionResult,
  type CommandResult,
} from "@/lib/domain/commands";
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
    revalidatePath("/overview");
    revalidatePath("/invoices");
    revalidatePath("/expenses");
    revalidatePath("/invoices/[id]", "page");
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
