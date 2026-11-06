import "server-only";
import { z } from "zod";
import { CommandError, commandResultSchema } from "@/lib/domain/commands";
import { parseIntakeCandidate } from "@/lib/domain/intake";
import { createClient } from "@/lib/supabase/server";
import { requireActor } from "./auth";
import type { Json, Tables } from "@/lib/database.types";

export type IntakeItem = Tables<"intake_items">;
export type IntakeSource = Pick<Tables<"intake_sources">, "id" | "label" | "kind">;
export const intakeBatchSchema = z.array(z.strictObject({ externalId: z.string().trim().min(1).max(200), sourceVersion: z.string().trim().min(1).max(200), candidate: z.unknown(), evidence: z.record(z.string(), z.unknown()) })).min(1).max(100);
export const batchResultSchema = z.array(z.object({ externalId: z.string().nullable(), itemId: z.uuid().nullable().optional(), status: z.string(), code: z.string().optional(), replayed: z.boolean().optional() }));
export type IntakeBatchResult = z.infer<typeof batchResultSchema>;

export async function getIntakePage(page = 1, state: "open" | "resolved" = "open", itemId?: string) {
  const actor = await requireActor();
  const client = await createClient();
  if (itemId && !z.uuid().safeParse(itemId).success) throw new CommandError("VALIDATION_ERROR");
  let query = client.from("intake_items").select("*", { count: "exact" }).eq("business_id", actor.businessId);
  query = itemId ? query.eq("id", itemId) : query.in("status", state === "open" ? ["pending", "needs_match"] : ["applied", "rejected", "superseded", "unchanged"]);
  const [sources, items] = await Promise.all([
    client.from("intake_sources").select("id,label,kind").eq("business_id", actor.businessId).order("created_at"),
    query.order("observed_at", { ascending: false }).order("id", { ascending: false }).range(itemId ? 0 : (page - 1) * 20, itemId ? 0 : page * 20 - 1),
  ]);
  if (sources.error || items.error) throw new Error("The Review Inbox could not be loaded. Try refreshing.");
  return { sources: sources.data, items: items.data, count: items.count ?? 0 };
}

export async function stageIntakeBatch(sourceId: string, input: unknown): Promise<IntakeBatchResult> {
  if (!z.uuid().safeParse(sourceId).success) throw new CommandError("VALIDATION_ERROR");
  const rows = intakeBatchSchema.safeParse(input);
  if (!rows.success) throw new CommandError("VALIDATION_ERROR");
  for (const row of rows.data) {
    try { parseIntakeCandidate(row.candidate); }
    catch { throw new CommandError("VALIDATION_ERROR"); }
    if (Buffer.byteLength(JSON.stringify(row.evidence)) > 16_384) throw new CommandError("VALIDATION_ERROR");
  }
  if (Buffer.byteLength(JSON.stringify(rows.data)) > 524_288) throw new CommandError("VALIDATION_ERROR");
  await requireActor();
  const client = await createClient();
  const { data, error } = await client.rpc("stage_intake_batch", { p_source_id: sourceId, p_rows: rows.data as Json });
  if (error) throw CommandError.fromDatabase(error.message);
  const result = batchResultSchema.safeParse(data);
  if (!result.success) throw new CommandError("SERVICE_UNAVAILABLE");
  return result.data;
}

const reviewSchema = z.strictObject({ id: z.uuid(), reviewVersion: z.number().int().positive(), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), decision: z.enum(["apply", "edit", "reject", "clarify"]), candidate: z.unknown().optional(), note: z.string().trim().max(4000).optional(), confirmed: z.boolean().optional() });

export async function reviewIntake(input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw new CommandError("VALIDATION_ERROR");
  const value = parsed.data;
  await requireActor();
  const client = await createClient();
  if (value.decision === "apply") {
    if (value.confirmed !== true) throw new CommandError("VALIDATION_ERROR");
    const { data, error } = await client.rpc("apply_intake", { p_item_id: value.id, p_review_version: value.reviewVersion, p_expected_revision: value.revision });
    if (error) throw CommandError.fromDatabase(error.message);
    const result = commandResultSchema.safeParse(data);
    if (!result.success) throw new CommandError("SERVICE_UNAVAILABLE");
    return { message: result.data.replayed ? "This proposal was already applied. No duplicate was created." : "Proposal applied. Your cash plan has been refreshed." };
  }
  if (!value.note) throw new CommandError("VALIDATION_ERROR");
  if (value.decision === "edit") {
    let candidate;
    try { candidate = parseIntakeCandidate(value.candidate, true); }
    catch { throw new CommandError("VALIDATION_ERROR"); }
    const { error } = await client.rpc("amend_intake", { p_item_id: value.id, p_review_version: value.reviewVersion, p_expected_revision: value.revision, p_candidate: candidate, p_note: value.note });
    if (error) throw CommandError.fromDatabase(error.message);
    return { message: "Review saved against the latest records. Confirm the proposal when ready." };
  }
  const { error } = await client.rpc("review_intake", { p_item_id: value.id, p_review_version: value.reviewVersion, p_decision: value.decision, p_reason: value.note });
  if (error) throw CommandError.fromDatabase(error.message);
  return { message: value.decision === "reject" ? "Proposal rejected. Saved financial records were not changed." : "Proposal held for clarification." };
}

export function isBulkConfirmable(item: IntakeItem): boolean {
  if (item.status !== "pending") return false;
  try { parseIntakeCandidate(item.candidate); return true; } catch { return false; }
}

const bulkConfirmSchema = z.strictObject({
  items: z.array(z.strictObject({ id: z.uuid(), reviewVersion: z.number().int().positive().max(2_147_483_647) })).min(1).max(50)
    .refine(items => new Set(items.map(item => item.id.toLowerCase())).size === items.length),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export async function confirmSelectedIntake(input: unknown): Promise<{ confirmed: string[]; failed: { id: string; code: string }[]; revision: number }> {
  const parsed = bulkConfirmSchema.safeParse(input);
  if (!parsed.success) throw new CommandError("VALIDATION_ERROR");
  await requireActor();
  const client = await createClient();
  let revision = parsed.data.revision;
  const confirmed: string[] = [], failed: { id: string; code: string }[] = [];
  for (const item of parsed.data.items) {
    try {
      const { data, error } = await client.rpc("apply_intake", { p_item_id: item.id, p_review_version: item.reviewVersion, p_expected_revision: revision });
      if (error) throw CommandError.fromDatabase(error.message);
      const result = commandResultSchema.safeParse(data);
      if (!result.success) throw new CommandError("SERVICE_UNAVAILABLE");
      revision = result.data.revision;
      confirmed.push(item.id);
    } catch (error) {
      failed.push({ id: item.id, code: error instanceof CommandError ? error.code : "SERVICE_UNAVAILABLE" });
    }
  }
  return { confirmed, failed, revision };
}
