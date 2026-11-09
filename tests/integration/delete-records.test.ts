import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("deleting an invoice or bill entered by mistake", () => {
  let fixture: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;

  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> {
    expect(result.error).toBeNull();
    return result as Extract<T, { error: null }>;
  }
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

  async function snapshot() { return checked(await owner.rpc("workspace_snapshot")).data; }
  async function del(client: SupabaseClient, type: string, payload: object, extra: object = {}) {
    return client.rpc("delete_workspace_record", { p_command: { requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type, payload, ...extra } });
  }
  async function newInvoice(number: string) {
    const id = randomUUID();
    checked(await admin.from("invoices").insert({ id, business_id: fixture.id, customer_id: fixture.customerId, number, amount_cents: 1_000_000, due_date: "2026-11-02" }));
    return id;
  }
  async function newExpense(label: string) {
    const id = randomUUID();
    checked(await admin.from("expenses").insert({ id, business_id: fixture.id, label, payee: "Test payee", amount_cents: 500_000, due_date: "2026-11-02" }));
    return id;
  }

  it("lets finance delete an unpaid invoice with its plan and follow-ups, and keeps the record in the audit log", async () => {
    const id = await newInvoice("DEL-001");
    checked(await admin.from("expectations").insert({ business_id: fixture.id, invoice_id: id, amount_cents: 1_000_000, remaining_cents: 1_000_000,
      expected_date: "2026-11-02", kind: "assumption", source_note: "Assumed payment on the due date.", confirmed_by: fixture.accounts.owner.id }));
    checked(await admin.from("followups").insert({ business_id: fixture.id, invoice_id: id, assignee_id: fixture.accounts.finance.id,
      due_date: "2026-11-01", next_action: "Call the customer.", state: "open" }));
    const before = await snapshot();
    const result = checked(await del(finance, "delete_invoice", { id, reason: "Entered by mistake" })).data;
    expect(result).toMatchObject({ revision: before.revision + 1, recordId: id, replayed: false });
    const after = await snapshot();
    expect(after.invoices.some((row: { id: string }) => row.id === id)).toBe(false);
    expect(checked(await admin.from("expectations").select("id").eq("invoice_id", id)).data).toHaveLength(0);
    expect(checked(await admin.from("followups").select("id").eq("invoice_id", id)).data).toHaveLength(0);
    const audit = checked(await admin.from("audit_events").select("change,reason,actor_id").eq("entity_id", id)).data;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ reason: "Entered by mistake", actor_id: fixture.accounts.finance.id,
      change: { deleted: true, before: { number: "DEL-001" }, after: null } });
    expect(audit[0].change.removedWithIt.expectations).toHaveLength(1);
    expect(audit[0].change.removedWithIt.followups).toHaveLength(1);
  });

  it("replays an identical retry once and refuses stale or reused requests", async () => {
    const id = await newInvoice("DEL-002");
    const command = { requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type: "delete_invoice", payload: { id, reason: "Entered by mistake" } };
    const first = checked(await owner.rpc("delete_workspace_record", { p_command: command })).data;
    const replay = checked(await owner.rpc("delete_workspace_record", { p_command: command })).data;
    expect(replay).toMatchObject({ recordId: id, revision: first.revision, replayed: true });
    expect((await owner.rpc("delete_workspace_record", { p_command: { ...command, payload: { id, reason: "A different reason" } } })).error?.message).toBe("REQUEST_ID_REUSE");
    const another = await newInvoice("DEL-003");
    const stale = await del(owner, "delete_invoice", { id: another, reason: "Entered by mistake" }, { expectedRevision: first.revision - 1 });
    expect(stale.error?.message).toBe("STALE_VERSION");
    expect((await snapshot()).invoices.some((row: { id: string }) => row.id === another)).toBe(true);
  });

  it("refuses an invoice or bill that has payment history, even a voided payment", async () => {
    const paidInvoice = await newInvoice("DEL-004");
    const paidExpense = await newExpense("Paid bill");
    const post = async (kind: string, parentId: string) => checked(await callCommand(owner, {
      requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type: "post_cash_movement",
      payload: { kind, parentId, amountCents: 100_000, date: "2026-10-29", reference: "REF-" + parentId.slice(0, 8) },
    })).data;
    const receipt = await post("receipt", paidInvoice);
    await post("expense_payment", paidExpense);
    expect((await del(owner, "delete_invoice", { id: paidInvoice, reason: "Entered by mistake" })).error?.message).toBe("HAS_PAYMENTS");
    expect((await del(owner, "delete_expense", { id: paidExpense, reason: "Entered by mistake" })).error?.message).toBe("HAS_PAYMENTS");
    checked(await callCommand(owner, { requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type: "void_cash_movement",
      payload: { movementId: receipt.recordId, reason: "Recorded by mistake." } }));
    expect((await del(owner, "delete_invoice", { id: paidInvoice, reason: "Entered by mistake" })).error?.message).toBe("HAS_PAYMENTS");
    const kept = await snapshot();
    expect(kept.invoices.some((row: { id: string }) => row.id === paidInvoice)).toBe(true);
    expect(kept.expenses.some((row: { id: string }) => row.id === paidExpense)).toBe(true);
  });

  it("deletes an unpaid bill, and rejects missing records, other businesses, empty reasons and the wrong type", async () => {
    const id = await newExpense("Mistaken bill");
    checked(await del(finance, "delete_expense", { id, reason: "Entered by mistake" }));
    expect((await snapshot()).expenses.some((row: { id: string }) => row.id === id)).toBe(false);
    expect((await del(owner, "delete_expense", { id, reason: "Entered by mistake" })).error?.message).toBe("NOT_FOUND");
    expect((await del(owner, "delete_invoice", { id: other.invoiceId, reason: "Entered by mistake" })).error?.message).toBe("NOT_FOUND");
    const mine = await newInvoice("DEL-005");
    expect((await del(owner, "delete_invoice", { id: mine, reason: "" })).error?.message).toBe("VALIDATION_ERROR");
    expect((await del(owner, "save_invoice", { id: mine, reason: "Entered by mistake" })).error?.message).toBe("VALIDATION_ERROR");
    expect((await snapshot()).invoices.some((row: { id: string }) => row.id === mine)).toBe(true);
  });
});
