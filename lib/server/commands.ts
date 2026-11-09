import "server-only";
import { CommandError, commandResultSchema, workspaceCommandSchema, type CommandResult, type WorkspaceCommand } from "@/lib/domain/commands";
import { createClient } from "@/lib/supabase/server";
import { requireActor } from "./auth";

export async function runCommand(command: WorkspaceCommand): Promise<CommandResult> {
  const parsed = workspaceCommandSchema.safeParse(command);
  if (!parsed.success) {
    throw new CommandError("VALIDATION_ERROR", Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
  }
  await requireActor();
  const client = await createClient();
  const { data, error } = await client.rpc(parsed.data.type.startsWith("delete_") ? "delete_workspace_record" : "workspace_command", { p_command: parsed.data });
  if (error) {
    throw CommandError.fromDatabase(error.message);
  }
  const result = commandResultSchema.safeParse(data);
  if (!result.success) throw new CommandError("SERVICE_UNAVAILABLE");
  return result.data;
}
