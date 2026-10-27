import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anonymous, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("workspace access", () => {
  let fixture: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;

  beforeAll(async () => {
    fixture = await createTestBusiness();
    other = await createTestBusiness();
    owner = await signInAs(fixture.accounts.owner);
    finance = await signInAs(fixture.accounts.finance);
  });

  afterAll(async () => {
    await owner?.auth.signOut();
    await finance?.auth.signOut();
    if (other) await disposeTestBusiness(other);
    if (fixture) await disposeTestBusiness(fixture);
  });

  it("rejects anonymous table and snapshot access", async () => {
    for (const table of ["businesses", "memberships", "customers", "invoices", "expenses", "cash_movements", "expectations", "followups", "reminders", "command_receipts", "audit_events", "automation_runs", "ai_usage"]) {
      expect((await anonymous.from(table).select("*").limit(1)).error, table).not.toBeNull();
    }
    expect((await anonymous.rpc("workspace_snapshot")).error).not.toBeNull();
  });

  it("returns authorized owner and finance snapshots", async () => {
    for (const [client, role] of [[owner, "owner"], [finance, "finance"]] as const) {
      const result = await client.rpc("workspace_snapshot");
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ business: { id: fixture.id }, actor: { role }, forecastInput: { availableCents: 4_000_000 } });
    }
  });

  it("filters unrelated businesses and protects their record history", async () => {
    const rows = await owner.from("businesses").select("id").eq("id", other.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
    const history = await owner.rpc("workspace_history", { p_kind: "invoice", p_id: other.invoiceId, p_cursor: null });
    expect(history.error).not.toBeNull();
  });

  it("denies direct financial writes and role self-promotion", async () => {
    expect((await owner.from("businesses").update({ opening_cash_cents: 1 }).eq("id", fixture.id)).error).not.toBeNull();
    expect((await finance.from("memberships").update({ role: "owner" }).eq("user_id", fixture.accounts.finance.id)).error).not.toBeNull();
    expect((await finance.rpc("workspace_snapshot")).data.actor.role).toBe("finance");
  });

  it("does not authorize using editable user metadata", async () => {
    const changed = await finance.auth.updateUser({ data: { role: "owner", business_id: other.id } });
    expect(changed.error).toBeNull();
    expect((await finance.rpc("workspace_snapshot")).data.actor).toMatchObject({ role: "finance", businessId: fixture.id });
  });

  it("rejects cross-business invoice/customer references at the database boundary", async () => {
    const result = await admin.from("invoices").insert({ business_id: fixture.id, customer_id: other.customerId, number: "WRONG-BUSINESS", amount_cents: 100, due_date: "2026-10-29" });
    expect(result.error?.code).toBe("23503");
  });

  it("calculates balances from valid actual receipts and payments without counting voided money", async () => {
    const expenseId = randomUUID();
    const receiptId = randomUUID();
    const paymentId = randomUUID();
    try {
      expect((await admin.from("expenses").insert({ id: expenseId, business_id: fixture.id, label: "Test expense", payee: "Test supplier", amount_cents: 3_000_000, due_date: "2026-10-30" })).error).toBeNull();
      expect((await admin.from("cash_movements").insert([
        { id: receiptId, business_id: fixture.id, kind: "receipt", invoice_id: fixture.invoiceId, amount_cents: 2_000_000, payment_date: "2026-10-28", request_id: randomUUID(), recorded_by: fixture.accounts.finance.id },
        { id: paymentId, business_id: fixture.id, kind: "expense_payment", expense_id: expenseId, amount_cents: 1_000_000, payment_date: "2026-10-28", request_id: randomUUID(), recorded_by: fixture.accounts.finance.id },
      ])).error).toBeNull();
      const before = await owner.rpc("workspace_snapshot");
      expect(before.error).toBeNull();
      expect(before.data.forecastInput).toMatchObject({ availableCents: 5_000_000, invoices: [{ outstandingCents: 3_000_000 }], expenses: [{ unpaidCents: 2_000_000 }] });
      expect((await admin.from("cash_movements").update({ voided_at: new Date().toISOString(), voided_by: fixture.accounts.owner.id, void_reason: "Fixture correction" }).eq("id", receiptId)).error).toBeNull();
      const after = await owner.rpc("workspace_snapshot");
      expect(after.data.forecastInput).toMatchObject({ availableCents: 3_000_000, invoices: [{ outstandingCents: 5_000_000 }] });
    } finally {
      await admin.from("cash_movements").delete().in("id", [receiptId, paymentId]).eq("business_id", fixture.id);
      await admin.from("expenses").delete().eq("id", expenseId).eq("business_id", fixture.id);
    }
  });

  it("paginates same-timestamp audit history without missing or repeating events", async () => {
    const createdAt = "2026-10-27T00:00:00Z";
    const inserted = await admin.from("audit_events").insert(Array.from({ length: 21 }, (_, n) => ({ business_id: fixture.id, actor_id: fixture.accounts.owner.id, entity_kind: "invoice", entity_id: fixture.invoiceId, change: { n }, created_at: createdAt })));
    expect(inserted.error).toBeNull();
    const first = await owner.rpc("workspace_history", { p_kind: "invoice", p_id: fixture.invoiceId, p_cursor: null });
    expect(first.error).toBeNull();
    expect(first.data.events).toHaveLength(20);
    const second = await owner.rpc("workspace_history", { p_kind: "invoice", p_id: fixture.invoiceId, p_cursor: first.data.nextCursor });
    expect(second.error).toBeNull();
    expect(second.data.events).toHaveLength(1);
    expect(second.data.nextCursor).toBeNull();
    expect(new Set([...first.data.events, ...second.data.events].map(event => event.id)).size).toBe(21);
  });

  it("observes membership changes despite an existing signed-in session", async () => {
    const changed = await admin.from("memberships").update({ role: "finance" }).eq("user_id", fixture.accounts.owner.id);
    expect(changed.error).toBeNull();
    expect((await owner.rpc("workspace_snapshot")).data.actor.role).toBe("finance");
    await admin.from("memberships").update({ role: "owner" }).eq("user_id", fixture.accounts.owner.id);
  });

  it("denies access immediately when the current membership is removed", async () => {
    const removed = await admin.from("memberships").delete().eq("user_id", fixture.accounts.owner.id);
    expect(removed.error).toBeNull();
    expect((await owner.rpc("workspace_snapshot")).error).not.toBeNull();
    expect((await owner.from("businesses").select("id").eq("id", fixture.id)).data).toEqual([]);
  });
});
