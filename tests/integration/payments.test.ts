import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateForecast } from "../../lib/domain/forecast";
import { admin, anonymous, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("actual cash movements and corrections", () => {
  let fixture: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;
  const expenseIds = [randomUUID(), randomUUID(), randomUUID()];
  const expectationId = randomUUID();
  const foreignMovementId = randomUUID();

  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> {
    expect(result.error).toBeNull();
    return result as Extract<T, { error: null }>;
  }
  beforeAll(async () => {
    fixture = await createTestBusiness();
    other = await createTestBusiness();
    owner = await signInAs(fixture.accounts.owner);
    finance = await signInAs(fixture.accounts.finance);
    checked(await admin.from("cash_movements").insert({ id: foreignMovementId, business_id: other.id, invoice_id: other.invoiceId, kind: "receipt", amount_cents: 100, payment_date: "2026-10-29", request_id: randomUUID(), recorded_by: other.accounts.owner.id }));
    checked(await admin.from("expenses").insert(expenseIds.map((id, index) => ({ id, business_id: fixture.id, label: ["Payroll", "Supplier", "Rent"][index], payee: "Test payee", amount_cents: [5_000_000, 2_000_000, 1_000_000][index], due_date: "2026-10-30" }))));
  });
  beforeEach(async () => {
    if (fixture.name !== "test-" + fixture.id) throw new Error("Refusing a non-fixture reset.");
    checked(await admin.from("followups").delete().eq("business_id", fixture.id));
    const tables = ["reminders", "expectations", "audit_events", "command_receipts"];
    const deleted = await Promise.all(tables.map(table => admin.from(table).delete().eq("business_id", fixture.id)));
    deleted.forEach(checked);
    checked(await admin.from("cash_movements").delete().eq("business_id", fixture.id));
    checked(await admin.from("invoices").update({ amount_cents: 5_000_000, due_date: "2026-10-29", version: 1 }).eq("id", fixture.invoiceId).eq("business_id", fixture.id));
    checked(await admin.from("expenses").update({ due_date: "2026-10-30", version: 1 }).eq("business_id", fixture.id));
    checked(await admin.from("businesses").update({ opening_cash_cents: 4_000_000, opening_date: "2026-10-26", opening_locked_at: null, revision: 0, demo_reference_date: "2026-10-29" }).eq("id", fixture.id).eq("name", fixture.name));
    checked(await admin.from("expectations").insert({ id: expectationId, business_id: fixture.id, invoice_id: fixture.invoiceId, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-11-02", kind: "commitment", source_note: "Fictional sample commitment.", confirmed_by: fixture.accounts.finance.id }));
  });
  afterAll(async () => {
    await owner?.auth.signOut();
    await finance?.auth.signOut();
    if (other) await disposeTestBusiness(other);
    if (fixture) await disposeTestBusiness(fixture);
  });

  async function snapshot() { return checked(await owner.rpc("workspace_snapshot")).data; }
  async function command(type: string, payload: object) { return { requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type, payload }; }
  function receipt(amountCents = 2_000_000, extra: object = {}) {
    return { kind: "receipt", parentId: fixture.invoiceId, amountCents, date: "2026-10-29", reference: "BANK-001", ...extra };
  }
  async function post(amount = 2_000_000, extra: object = {}) {
    return checked(await callCommand(finance, await command("post_cash_movement", receipt(amount, extra)))).data;
  }
  async function voidMovement(id: string, reason = "Checked an incorrect receipt entry.") {
    return callCommand(owner, await command("void_cash_movement", { movementId: id, reason }));
  }
  async function task(automatic: boolean, completedByHuman = false) {
    const id = randomUUID();
    checked(await admin.from("followups").insert({ id, business_id: fixture.id, invoice_id: fixture.invoiceId,
      expectation_id: automatic ? expectationId : null, assignee_id: fixture.accounts.finance.id, due_date: "2026-10-28",
      next_action: "Check the customer's payment.", automatic_type: automatic ? "missed_commitment" : null,
      state: completedByHuman ? "completed" : "open", completion_source: completedByHuman ? "human" : null,
      completed_at: completedByHuman ? new Date().toISOString() : null, outcome: completedByHuman ? "Customer called." : null }));
    return id;
  }

  it("posts the sample partial receipt and computes the real cash plan without double counting", async () => {
    const result = await post();
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(6_000_000);
    expect(saved.invoices[0]).toMatchObject({ outstanding_cents: 3_000_000, paid_cents: 2_000_000 });
    expect(saved.expectations[0]).toMatchObject({ remaining_cents: 3_000_000, expected_date: "2026-11-02", state: "active" });
    expect(calculateForecast(saved.forecastInput).days.find(day => day.date === "2026-10-30")?.closingCents).toBe(-2_000_000);
    expect(saved.business.opening_locked_at).not.toBeNull();
    expect(checked(await owner.from("cash_movements").select("*").eq("id", result.recordId).single()).data).toMatchObject({ amount_cents: 2_000_000, reference: "bank-001", recorded_by: fixture.accounts.finance.id });
  });

  it("removes a fully received expectation from future cash", async () => {
    await post(5_000_000);
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(9_000_000);
    expect(saved.invoices[0].outstanding_cents).toBe(0);
    expect(saved.expectations).toEqual([]);
    expect(calculateForecast(saved.forecastInput).maxShortfallCents).toBe(0);
    expect(checked(await owner.from("expectations").select("state,remaining_cents").eq("id", expectationId).single()).data).toEqual({ state: "fulfilled", remaining_cents: 0 });
  });

  it.each([1_000_000, 5_000_000])("posts an expense payment of %i without counting its outflow twice", async amountCents => {
    const input = await command("post_cash_movement", { kind: "expense_payment", parentId: expenseIds[0], amountCents, date: "2026-10-29", reference: "PAYROLL-1" });
    checked(await callCommand(finance, input));
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(4_000_000 - amountCents);
    expect(saved.expenses.find((row: { id: string }) => row.id === expenseIds[0]).unpaid_cents).toBe(5_000_000 - amountCents);
    expect(calculateForecast(saved.forecastInput).days.find(day => day.date === "2026-10-30")?.closingCents).toBe(-4_000_000);
  });

  it.each([{ amountCents: 5_000_001 }, { amountCents: 0 }, { amountCents: 1.5 }, { date: "2026-10-25" }, { date: "2026-10-30" }, { date: "2026-02-30" }])("rejects invalid actual receipt %j without a write", async invalid => {
    const before = await snapshot();
    expect((await callCommand(finance, await command("post_cash_movement", receipt(2_000_000, invalid)))).error?.message).toBe("VALIDATION_ERROR");
    expect((await snapshot()).revision).toBe(before.revision);
    expect(checked(await owner.from("cash_movements").select("id")).data).toEqual([]);
  });

  it("supports an exact retry after a simulated lost response, even after another save", async () => {
    const input = await command("post_cash_movement", receipt());
    const first = checked(await callCommand(finance, input)).data;
    checked(await callCommand(owner, await command("save_customer", { name: "Later change", contactName: "Contact" })));
    const retry = checked(await callCommand(finance, input)).data;
    expect(retry).toEqual({ ...first, replayed: true });
    expect(checked(await owner.from("cash_movements").select("id")).data).toHaveLength(1);
    expect((await callCommand(finance, { ...input, payload: receipt(1_000_000) })).error?.message).toBe("REQUEST_ID_REUSE");
  });

  it("allows at most one concurrent 20,000-peso attempt against 30,000 remaining", async () => {
    await post(2_000_000, { date: "2026-10-28", reference: "EARLIER" });
    const first = await command("post_cash_movement", receipt(2_000_000, { reference: "ATTEMPT-A" }));
    const second = { ...first, requestId: randomUUID(), payload: receipt(2_000_000, { reference: "ATTEMPT-B" }) };
    const results = await Promise.all([callCommand(owner, first), callCommand(finance, second)]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(results.find(result => result.error)?.error?.message).toBe("STALE_VERSION");
    expect((await snapshot()).invoices[0].outstanding_cents).toBe(1_000_000);
  });

  it("keeps normalized references unique across void history and preserves the original context", async () => {
    const original = await post(2_000_000, { reference: "  Bank-AbC  " });
    expect((await callCommand(finance, await command("post_cash_movement", receipt(100, { reference: "BANK-abc" })))).error?.message).toBe("DUPLICATE_REFERENCE");
    checked(await voidMovement(original.recordId));
    expect((await callCommand(finance, await command("post_cash_movement", receipt(100, { reference: "bank-ABC" })))).error?.message).toBe("DUPLICATE_REFERENCE");
    const replacement = await post(1_000_000, { reference: "BANK-CORRECTED" });
    expect(checked(await owner.from("cash_movements").select("effects").eq("id", replacement.recordId).single()).data.effects.priorVoid).toMatchObject({ id: original.recordId, reference: "bank-abc" });
  });

  it("requires a reasoned review for possible duplicates and never overrides a reused reference", async () => {
    await post(1_000_000, { reference: "" });
    const input = await command("post_cash_movement", receipt(1_000_000, { reference: "SECOND" }));
    expect((await callCommand(finance, input)).error?.message).toBe("POSSIBLE_DUPLICATE");
    expect((await callCommand(finance, { ...input, payload: receipt(1_000_000, { reference: "SECOND", duplicateReviewed: true }) })).error?.message).toBe("VALIDATION_ERROR");
    const confirmed = checked(await callCommand(finance, { ...input, payload: receipt(1_000_000, { reference: "SECOND", duplicateReviewed: true, duplicateReviewReason: "Verified separate bank entries." }) })).data;
    expect(checked(await owner.from("cash_movements").select("effects").eq("id", confirmed.recordId).single()).data.effects.duplicateReviewReason).toBe("Verified separate bank entries.");
    expect((await callCommand(finance, await command("post_cash_movement", receipt(100, { reference: "SECOND", duplicateReviewed: true, duplicateReviewReason: "Cannot override." })))).error?.message).toBe("DUPLICATE_REFERENCE");
  });

  it("rejects unauthorized or unrelated parent and movement IDs", async () => {
    expect((await callCommand(anonymous, await command("post_cash_movement", receipt()))).error).not.toBeNull();
    expect((await callCommand(finance, await command("post_cash_movement", receipt(100, { parentId: other.invoiceId })))).error?.message).toBe("NOT_FOUND");
    expect((await voidMovement(foreignMovementId)).error?.message).toBe("NOT_FOUND");
    const saved = await post();
    expect((await callCommand(finance, await command("void_cash_movement", { movementId: saved.recordId, reason: "Finance cannot void." }))).error?.message).toBe("FORBIDDEN");
    expect((await callCommand(owner, await command("void_cash_movement", { movementId: saved.recordId, reason: "" }))).error?.message).toBe("VALIDATION_ERROR");
  });

  it("voids a receipt without raising or forecasting its remaining expectation", async () => {
    const saved = await post();
    checked(await voidMovement(saved.recordId));
    const after = await snapshot();
    expect(after.forecastInput.availableCents).toBe(4_000_000);
    expect(after.invoices[0].outstanding_cents).toBe(5_000_000);
    expect(after.expectations[0]).toMatchObject({ state: "needs_review", remaining_cents: 3_000_000, expected_date: "2026-11-02" });
    expect(calculateForecast(after.forecastInput).days[0].expectedInCents).toBe(0);
    expect(calculateForecast(after.forecastInput).maxShortfallCents).toBe(4_000_000);
    expect(after.followups).toHaveLength(1);
    expect(after.followups[0]).toMatchObject({ automatic_type: "correction_review", correction_movement_id: saved.recordId, state: "open" });
  });

  it("does not revive a superseded promise when a newer commitment exists", async () => {
    const saved = await post();
    checked(await admin.from("expectations").update({ state: "superseded" }).eq("id", expectationId));
    const newerId = randomUUID();
    checked(await admin.from("expectations").insert({ id: newerId, business_id: fixture.id, invoice_id: fixture.invoiceId, amount_cents: 3_000_000, remaining_cents: 3_000_000, expected_date: "2026-11-03", kind: "commitment", source_note: "Newest customer statement.", confirmed_by: fixture.accounts.finance.id }));
    checked(await voidMovement(saved.recordId));
    expect((await snapshot()).expectations).toMatchObject([{ id: newerId, state: "needs_review", amount_cents: 3_000_000, remaining_cents: 3_000_000, expected_date: "2026-11-03", source_note: "Newest customer statement." }]);
    expect(checked(await owner.from("expectations").select("state").eq("id", expectationId).single()).data.state).toBe("superseded");
  });

  it("reopens only tasks that this movement automatically resolved", async () => {
    const autoId = await task(true);
    const humanId = await task(false, true);
    const manualId = await task(false);
    const paid = await post(5_000_000);
    expect(checked(await owner.from("followups").select("*").eq("id", autoId).single()).data).toMatchObject({ state: "completed", completion_source: "cash_movement", resolved_by_movement_id: paid.recordId });
    expect(checked(await owner.from("followups").select("state").eq("id", manualId).single()).data.state).toBe("open");
    checked(await voidMovement(paid.recordId));
    expect(checked(await owner.from("followups").select("*").eq("id", autoId).single()).data).toMatchObject({ state: "open", completion_source: null, resolved_by_movement_id: null });
    expect(checked(await owner.from("followups").select("*").eq("id", humanId).single()).data).toMatchObject({ state: "completed", completion_source: "human", outcome: "Customer called." });
    expect((await snapshot()).followups).toHaveLength(3);
  });

  it("attaches a correction to an existing open task and keeps repeated voids inert", async () => {
    const manualId = await task(false);
    const paid = await post();
    const first = checked(await voidMovement(paid.recordId)).data;
    const historyCount = checked(await owner.from("audit_events").select("id")).data.length;
    const retry = checked(await voidMovement(paid.recordId, "Another click must not replace the first reason.")).data;
    expect(retry).toMatchObject({ revision: first.revision, recordId: paid.recordId, replayed: true });
    expect((await snapshot()).followups).toMatchObject([{ id: manualId, state: "open", correction_movement_id: paid.recordId }]);
    expect(checked(await owner.from("audit_events").select("id")).data).toHaveLength(historyCount);
    expect(checked(await owner.from("cash_movements").select("void_reason").eq("id", paid.recordId).single()).data.void_reason).toBe("Checked an incorrect receipt entry.");
    checked(await callCommand(owner, await command("save_invoice", { id: fixture.invoiceId, number: "INV-001", customerId: fixture.customerId, amountCents: 3_000_000, dueDate: "2026-11-04", reason: "Authorized correction after void." })));
    expect((await snapshot()).invoices[0].amount_cents).toBe(3_000_000);
  });

  it("preserves a task subsequently completed by a person and creates a correction review", async () => {
    const id = await task(true);
    const paid = await post(5_000_000);
    checked(await admin.from("followups").update({ completion_source: "human", resolved_by_movement_id: null, outcome: "Human review completed." }).eq("id", id));
    checked(await voidMovement(paid.recordId));
    const saved = await snapshot();
    expect(saved.followups.find((row: { id: string }) => row.id === id)).toMatchObject({ state: "completed", completion_source: "human", outcome: "Human review completed." });
    expect(saved.followups.filter((row: { automatic_type: string }) => row.automatic_type === "correction_review")).toHaveLength(1);
  });

  it("restores an overdue expense as due-now when its payment is voided", async () => {
    checked(await admin.from("expenses").update({ due_date: "2026-10-27" }).eq("id", expenseIds[0]));
    const paid = checked(await callCommand(finance, await command("post_cash_movement", { kind: "expense_payment", parentId: expenseIds[0], amountCents: 1_000_000, date: "2026-10-29", reference: "EXP-1" }))).data;
    checked(await voidMovement(paid.recordId));
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(4_000_000);
    expect(saved.expenses.find((row: { id: string }) => row.id === expenseIds[0]).unpaid_cents).toBe(5_000_000);
    expect(calculateForecast(saved.forecastInput).overdueExpenseIds).toContain(expenseIds[0]);
    expect(calculateForecast(saved.forecastInput).days[0].plannedOutCents).toBe(5_000_000);
  });

  it("invalidates a reminder approval when actual cash changes", async () => {
    const reminder = checked(await admin.from("reminders").insert({ business_id: fixture.id, invoice_id: fixture.invoiceId, recipient: "Contact", body: "Payment reminder", state: "approved", approval_basis: { invoiceVersion: 1 }, reviewed_by: fixture.accounts.owner.id, reviewed_at: new Date().toISOString() }).select("id").single()).data;
    await post();
    expect(checked(await owner.from("reminders").select("*").eq("id", reminder.id).single()).data).toMatchObject({ state: "draft", approval_basis: null, reviewed_by: null });
  });

  it("rolls back a late posting failure after the cash movement and expectation were written", async () => {
    checked(await admin.from("invoices").update({ version: 2_147_483_647 }).eq("id", fixture.invoiceId));
    const before = await snapshot();
    const input = await command("post_cash_movement", receipt());
    expect((await callCommand(finance, input)).error).not.toBeNull();
    const after = await snapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.forecastInput).toEqual(before.forecastInput);
    expect(checked(await owner.from("cash_movements").select("id")).data).toEqual([]);
    expect(checked(await owner.from("audit_events").select("id")).data).toEqual([]);
    expect(checked(await owner.from("command_receipts").select("request_id")).data).toEqual([]);
  });

  it("rolls back a late void failure and leaves actual cash and completed tasks intact", async () => {
    const autoId = await task(true);
    const paid = await post(5_000_000);
    checked(await admin.from("invoices").update({ version: 2_147_483_647 }).eq("id", fixture.invoiceId));
    const before = await snapshot();
    expect((await voidMovement(paid.recordId)).error).not.toBeNull();
    const after = await snapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.forecastInput).toEqual(before.forecastInput);
    expect(checked(await owner.from("cash_movements").select("voided_at").eq("id", paid.recordId).single()).data.voided_at).toBeNull();
    expect(checked(await owner.from("followups").select("*").eq("id", autoId).single()).data).toMatchObject({ state: "completed", resolved_by_movement_id: paid.recordId });
  });
});
