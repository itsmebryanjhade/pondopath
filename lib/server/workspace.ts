import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";
import type { ForecastInput } from "@/lib/domain/types";
import { calculateForecast } from "@/lib/domain/forecast";
import { createClient } from "@/lib/supabase/server";
import { requireActor, type Actor } from "./auth";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type AuditEvent = Omit<Row<"audit_events">, "id"> & { id: string };
export type WorkspaceSnapshot = {
  business: Row<"businesses">;
  revision: number;
  actor: Actor;
  members: Pick<Row<"memberships">, "user_id" | "display_name" | "role">[];
  customers: Row<"customers">[];
  invoices: (Row<"invoices"> & { paid_cents: number; outstanding_cents: number })[];
  expenses: (Row<"expenses"> & { paid_cents: number; unpaid_cents: number })[];
  expectations: Row<"expectations">[];
  followups: Row<"followups">[];
  reminders: Row<"reminders">[];
  automation: { lastSuccessAt: string | null; stale: boolean };
  forecastInput: ForecastInput;
};

function readError(message: string): never {
  if (message === "FORBIDDEN" || message === "UNAUTHENTICATED") redirect("/login?reason=access");
  throw new Error("Workspace records could not be loaded. Please try again.");
}

// Share a snapshot only within this server render, never between users or requests.
export const getWorkspace = cache(async (): Promise<WorkspaceSnapshot> => {
  const actor = await requireActor();
  const client = await createClient();
  const { data, error } = await client.rpc("workspace_snapshot");
  if (error || !data) readError(error?.message ?? "");
  // This JSON contract is produced by our versioned SQL function, not user input.
  const snapshot = data as unknown as WorkspaceSnapshot;
  if (snapshot.business.id !== actor.businessId || snapshot.actor.userId !== actor.userId)
    readError("");
  calculateForecast(snapshot.forecastInput);
  return snapshot;
});

export async function getRecordHistory(
  kind: "invoice" | "expense",
  id: string,
  cursor?: string,
  expectedRevision?: number,
): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
  const actor = await requireActor();
  const client = await createClient();
  const { data, error } = await client.rpc("workspace_history", {
    p_kind: kind,
    p_id: id,
    p_cursor: cursor ?? undefined,
  });
  if (error || !data) readError(error?.message ?? "");
  if (expectedRevision !== undefined)
    await assertRevision(client, actor.businessId, expectedRevision);
  return data as unknown as { events: AuditEvent[]; nextCursor: string | null };
}

async function assertRevision(
  client: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  expectedRevision: number,
) {
  const current = await client.from("businesses").select("revision").eq("id", businessId).single();
  if (current.error || current.data?.revision !== expectedRevision) {
    throw new Error("Records changed while loading. Retry to load matching balances and history.");
  }
}

export async function getCashMovements(
  kind: "receipt" | "expense_payment",
  expectedRevision: number,
  parentId?: string,
  movementId?: string,
): Promise<Row<"cash_movements">[]> {
  const actor = await requireActor();
  const client = await createClient();
  let query = client
    .from("cash_movements")
    .select("*")
    .eq("business_id", actor.businessId)
    .eq("kind", kind);
  if (parentId) query = query.eq(kind === "receipt" ? "invoice_id" : "expense_id", parentId);
  if (movementId) query = query.eq("id", movementId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (error || !data) readError(error?.message ?? "");
  await assertRevision(client, actor.businessId, expectedRevision);
  return data;
}
