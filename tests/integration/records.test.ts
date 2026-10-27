import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anonymous, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("atomic record commands", () => {
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

  async function revision() {
    const result = await owner.rpc("workspace_snapshot");
    expect(result.error).toBeNull();
    return result.data.revision as number;
  }
  async function command(type: string, payload: object) {
    return { requestId: randomUUID(), expectedRevision: await revision(), type, payload };
  }
  async function invoice(number: string) {
    const result = await callCommand(owner, await command("save_invoice", { number, customerId: fixture.customerId, amountCents: 5_000_000, dueDate: "2026-10-30" }));
    expect(result.error).toBeNull();
    return result.data.recordId as string;
  }
  const customer = { name: "Test company", contactName: "Test accounts contact" };

  it("requires authentication and current owner permission for opening cash", async () => {
    const input = await command("set_opening_cash", { amountCents: 0, date: "2026-10-26" });
    expect((await callCommand(anonymous, input)).error).not.toBeNull();
    expect((await callCommand(finance, input)).error?.message).toBe("FORBIDDEN");
    const saved = await callCommand(owner, input);
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ recordId: fixture.id, revision: input.expectedRevision + 1, replayed: false });
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(0);
    expect((await callCommand(owner, await command("set_opening_cash", { amountCents: 100, date: "2026-10-30" }))).error?.message).toBe("VALIDATION_ERROR");
    expect(await revision()).toBe(saved.data.revision);
  });

  it("observes a role downgrade in an already signed-in owner session", async () => {
    const input = await command("set_opening_cash", { amountCents: 1, date: "2026-10-26" });
    expect((await admin.from("memberships").update({ role: "finance" }).eq("user_id", fixture.accounts.owner.id)).error).toBeNull();
    try { expect((await callCommand(owner, input)).error?.message).toBe("FORBIDDEN"); }
    finally { await admin.from("memberships").update({ role: "owner" }).eq("user_id", fixture.accounts.owner.id); }
  });

  it("saves Unicode customer details with attributable before/after history", async () => {
    const created = await callCommand(finance, await command("save_customer", { ...customer, name: "Ñandú Services" }));
    expect(created.error).toBeNull();
    const saved = await callCommand(finance, await command("save_customer", { ...customer, id: created.data.recordId, name: "Ñandú Services", phone: "+63 900 000 0000" }));
    expect(saved.error).toBeNull();
    const history = await admin.from("audit_events").select("*").eq("business_id", fixture.id).eq("entity_id", created.data.recordId).order("id");
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(2);
    expect(history.data?.[1]).toMatchObject({ actor_id: fixture.accounts.finance.id, entity_kind: "customer", change: { before: { phone: null }, after: { phone: "+63 900 000 0000", version: 2 } } });
  });

  it("creates a clearly labelled due-date assumption without creating actual cash", async () => {
    const before = (await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents;
    const id = await invoice("ASSUMPTION");
    const expected = await owner.from("expectations").select("*").eq("invoice_id", id).single();
    expect(expected.error).toBeNull();
    expect(expected.data).toMatchObject({ kind: "assumption", expected_date: "2026-10-30", remaining_cents: 5_000_000, state: "active", confirmed_by: fixture.accounts.owner.id });
    expect(expected.data?.source_note).toMatch(/due date/i);
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(before);
  });

  it("replays the original result after a later save has advanced the revision", async () => {
    const input = await command("save_customer", { ...customer, name: "Retry test" });
    const first = await callCommand(owner, input);
    expect(first.error).toBeNull();
    expect((await callCommand(owner, await command("save_customer", { ...customer, name: "Later save" }))).error).toBeNull();
    const retry = await callCommand(owner, input);
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ ...first.data, replayed: true });
    const reused = await callCommand(owner, { ...input, payload: { ...customer, name: "Changed retry" } });
    expect(reused.error?.message).toBe("REQUEST_ID_REUSE");
    expect((await owner.from("customers").select("id").eq("id", first.data.recordId)).data).toHaveLength(1);
  });

  it("handles two concurrent copies of the same request exactly once", async () => {
    const input = await command("save_customer", { ...customer, name: "Concurrent exact retry" });
    const results = await Promise.all([callCommand(owner, input), callCommand(finance, input)]);
    expect(results.map(result => result.error)).toEqual([null, null]);
    expect(new Set(results.map(result => result.data.recordId)).size).toBe(1);
    expect(results.map(result => result.data.replayed).sort()).toEqual([false, true]);
    expect(await revision()).toBe(input.expectedRevision + 1);
  });

  it("rejects a conflicting concurrent edit instead of overwriting unseen changes", async () => {
    const first = await command("save_customer", { ...customer, name: "Concurrent first" });
    const second = { ...first, requestId: randomUUID(), payload: { ...customer, name: "Concurrent second" } };
    const results = await Promise.all([callCommand(owner, first), callCommand(finance, second)]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(results.find(result => result.error)?.error?.message).toBe("STALE_VERSION");
    expect(await revision()).toBe(first.expectedRevision + 1);
  });

  it.each(["businessId", "role", "actor", "approvedBy"])("rejects a caller-supplied %s override", async field => {
    const input = await command("save_customer", customer);
    expect((await callCommand(owner, { ...input, [field]: other.id })).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, { ...input, payload: { ...customer, [field]: other.id } })).error?.message).toBe("VALIDATION_ERROR");
  });

  it("does not reference or edit another business's records", async () => {
    const payload = { number: "FOREIGN", customerId: other.customerId, amountCents: 100, dueDate: "2026-10-30" };
    expect((await callCommand(owner, await command("save_invoice", payload))).error?.message).toBe("NOT_FOUND");
    expect((await callCommand(owner, await command("save_customer", { ...customer, id: other.customerId }))).error?.message).toBe("NOT_FOUND");
    expect((await callCommand(owner, await command("save_invoice", { ...payload, customerId: fixture.customerId, id: other.invoiceId }))).error?.message).toBe("NOT_FOUND");
  });

  it.each([
    { amountCents: -1 }, { amountCents: 0 }, { amountCents: 1.5 }, { amountCents: 100_000_000_000 },
    { amountCents: "100" }, { dueDate: "2026-02-30" }, { dueDate: "0000-01-01" },
    { dueDate: "2026-1-1" }, { number: " " }, { number: "x".repeat(101) },
  ])("rejects invalid invoice input at the SQL boundary: %j", async invalid => {
    const input = await command("save_invoice", { number: "INVALID", customerId: fixture.customerId, amountCents: 100, dueDate: "2026-10-30", ...invalid });
    expect((await callCommand(owner, input)).error?.message).toBe("VALIDATION_ERROR");
    expect(await revision()).toBe(input.expectedRevision);
    expect((await owner.from("command_receipts").select("request_id").eq("request_id", input.requestId)).data).toEqual([]);
  });

  it("rejects duplicate invoice numbers without changing the revision or creating an expectation", async () => {
    const input = await command("save_invoice", { number: "INV-001", customerId: fixture.customerId, amountCents: 100, dueDate: "2026-10-30" });
    const before = await owner.from("expectations").select("id");
    expect((await callCommand(owner, input)).error?.message).toBe("DUPLICATE_REFERENCE");
    expect(await revision()).toBe(input.expectedRevision);
    expect((await owner.from("expectations").select("id")).data).toEqual(before.data);
    expect((await owner.from("command_receipts").select("request_id").eq("request_id", input.requestId)).data).toEqual([]);
  });

  it("invalidates approval when customer contact details change", async () => {
    const reminder = await admin.from("reminders").insert({ business_id: fixture.id, invoice_id: fixture.invoiceId, recipient: "Old contact", body: "Please confirm payment.", state: "approved", approval_basis: { invoiceVersion: 1 }, reviewed_by: fixture.accounts.owner.id, reviewed_at: new Date().toISOString() }).select("id").single();
    expect(reminder.error).toBeNull();
    expect((await callCommand(finance, await command("save_customer", { ...customer, id: fixture.customerId, email: "updated@example.com" }))).error).toBeNull();
    const changed = await owner.from("reminders").select("*").eq("id", reminder.data!.id).single();
    expect(changed.data).toMatchObject({ state: "draft", approval_basis: null, reviewed_by: null, reviewed_at: null, version: 2 });
  });

  it("locks the opening baseline after any movement, even if a setup bypassed the lock timestamp", async () => {
    expect((await admin.from("cash_movements").insert({ business_id: fixture.id, kind: "receipt", invoice_id: fixture.invoiceId, amount_cents: 100, payment_date: "2026-10-29", request_id: randomUUID(), recorded_by: fixture.accounts.finance.id })).error).toBeNull();
    expect((await callCommand(owner, await command("set_opening_cash", { amountCents: 500, date: "2026-10-26" }))).error?.message).toBe("VALIDATION_ERROR");
  });

  it("enforces owner correction reasons, paid floors and locked invoice identity after posting", async () => {
    const id = await invoice("POSTED");
    expect((await admin.from("cash_movements").insert({ business_id: fixture.id, kind: "receipt", invoice_id: id, amount_cents: 2_000_000, payment_date: "2026-10-29", request_id: randomUUID(), recorded_by: fixture.accounts.finance.id })).error).toBeNull();
    const payload = { id, number: "POSTED", customerId: fixture.customerId, amountCents: 3_000_000, dueDate: "2026-11-02" };
    expect((await callCommand(finance, await command("save_invoice", { ...payload, reason: "Correction" }))).error?.message).toBe("FORBIDDEN");
    expect((await callCommand(owner, await command("save_invoice", payload))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_invoice", { ...payload, amountCents: 1_999_999, reason: "Below payments" }))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_invoice", { ...payload, number: "RENAMED", reason: "Identity change" }))).error?.message).toBe("VALIDATION_ERROR");
    const saved = await callCommand(owner, await command("save_invoice", { ...payload, reason: "Corrected total and original due date" }));
    expect(saved.error).toBeNull();
    const snapshot = (await owner.rpc("workspace_snapshot")).data;
    expect(snapshot.invoices.find((row: { id: string }) => row.id === id)).toMatchObject({ amount_cents: 3_000_000, outstanding_cents: 1_000_000, due_date: "2026-11-02" });
    expect(snapshot.expectations.find((row: { invoice_id: string }) => row.invoice_id === id)).toMatchObject({ state: "needs_review", remaining_cents: 1_000_000, expected_date: "2026-10-30" });
    expect((await owner.rpc("workspace_history", { p_kind: "invoice", p_id: id })).data.events[0]).toMatchObject({ actor_id: fixture.accounts.owner.id, reason: "Corrected total and original due date" });
    const alternate = await callCommand(owner, await command("save_customer", { name: "Different company", contactName: "Different contact" }));
    expect(alternate.error).toBeNull();
    expect((await callCommand(owner, await command("save_invoice", { ...payload, customerId: alternate.data.recordId, reason: "Counterparty change" }))).error?.message).toBe("VALIDATION_ERROR");
    expect((await admin.from("cash_movements").update({ voided_at: new Date().toISOString(), voided_by: fixture.accounts.owner.id, void_reason: "Fixture void" }).eq("invoice_id", id).eq("business_id", fixture.id)).error).toBeNull();
    expect((await callCommand(owner, await command("save_invoice", { ...payload, number: "RENAMED-AFTER-VOID", reason: "Still locked" }))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_invoice", { ...payload, amountCents: 500_000, reason: "Voided receipt does not count toward the paid floor" }))).error).toBeNull();
  });

  it("enforces the same paid-floor and counterparty rules for expense corrections", async () => {
    const payload = { label: "Posted expense", payee: "Test supplier", amountCents: 3_000_000, dueDate: "2026-10-30" };
    const saved = await callCommand(finance, await command("save_expense", payload));
    expect(saved.error).toBeNull();
    const id = saved.data.recordId as string;
    expect((await admin.from("cash_movements").insert({ business_id: fixture.id, kind: "expense_payment", expense_id: id, amount_cents: 1_000_000, payment_date: "2026-10-29", request_id: randomUUID(), recorded_by: fixture.accounts.finance.id })).error).toBeNull();
    expect((await callCommand(finance, await command("save_expense", { ...payload, id, amountCents: 2_000_000, reason: "Correction" }))).error?.message).toBe("FORBIDDEN");
    expect((await callCommand(owner, await command("save_expense", { ...payload, id, amountCents: 999_999, reason: "Too small" }))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_expense", { ...payload, id, payee: "Other payee", reason: "Reassignment" }))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_expense", { ...payload, id, amountCents: 2_000_000, dueDate: "2026-11-02", reason: "Corrected expense" }))).error).toBeNull();
    expect((await owner.rpc("workspace_snapshot")).data.expenses.find((row: { id: string }) => row.id === id)).toMatchObject({ unpaid_cents: 1_000_000, due_date: "2026-11-02" });
  });

  it("keeps direct REST record writes blocked after commands are available", async () => {
    expect((await finance.from("customers").insert({ business_id: fixture.id, name: "Bypass", contact_name: "Bypass" })).error).not.toBeNull();
    expect((await owner.from("invoices").update({ amount_cents: 1 }).eq("id", fixture.invoiceId)).error).not.toBeNull();
  });

  it.each(["invoice", "expense"] as const)("enforces the 1,000-%s limit without advancing the revision", async kind => {
    const table = kind === "invoice" ? "invoices" : "expenses";
    const count = kind === "invoice" ? 999 : 1000;
    const rows = Array.from({ length: count }, (_, index) => ({ business_id: other.id, amount_cents: 100, due_date: "2026-10-30",
      ...(kind === "invoice" ? { number: "LIMIT-" + index, customer_id: other.customerId } : { label: "Limit expense " + index, payee: "Test supplier" }) }));
    expect((await admin.from(table).insert(rows)).error).toBeNull();
    const client = await signInAs(other.accounts.owner);
    try {
      const before = await client.from("businesses").select("revision").eq("id", other.id).single();
      expect(before.error).toBeNull();
      const input = { requestId: randomUUID(), expectedRevision: before.data!.revision,
        type: kind === "invoice" ? "save_invoice" : "save_expense",
        payload: { amountCents: 100, dueDate: "2026-10-30", ...(kind === "invoice" ? { number: "OVER-LIMIT", customerId: other.customerId } : { label: "Over-limit expense", payee: "Test supplier" }) } };
      expect((await callCommand(client, input)).error?.message).toBe("LIMIT_REACHED");
      expect((await client.from("businesses").select("revision").eq("id", other.id).single()).data?.revision).toBe(before.data!.revision);
      expect((await client.from("command_receipts").select("request_id").eq("request_id", input.requestId)).data).toEqual([]);
    } finally { await client.auth.signOut(); }
  });
});
