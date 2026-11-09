import "server-only";
import { CommandError } from "@/lib/domain/commands";
import { requireActor } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

const FILE_KINDS = ["manual_csv", "manual_xlsx"];

/**
 * Returns the business's file source, creating "Uploaded files" on an owner's first upload, so people never pick a "source".
 * Database rules still decide who may create one; finance staff use an existing source.
 */
export async function ensureFileSource(): Promise<string> {
  const actor = await requireActor();
  const client = await createClient();
  const earliest = async () => {
    const { data, error } = await client.from("intake_sources").select("id").eq("business_id", actor.businessId)
      .in("kind", FILE_KINDS).order("created_at", { ascending: true }).limit(1);
    if (error) throw CommandError.fromDatabase(error.message);
    return (data?.[0] as { id: string } | undefined)?.id ?? null;
  };
  const existing = await earliest();
  if (existing) return existing;
  if (actor.role !== "owner") throw new CommandError("FORBIDDEN", { file: "Ask the owner to add the first file." });
  const created = await client.rpc("create_intake_source", { p_kind: "manual_csv", p_label: "Uploaded files" });
  if (created.error) throw CommandError.fromDatabase(created.error.message);
  // Two first uploads at once may both create a source; both then use the earliest.
  return (await earliest()) ?? (created.data as string);
}
