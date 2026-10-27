import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateForecast } from "../../lib/domain/forecast";
import { admin, anonymous, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("reviewed customer commitments and follow-ups", () => {
  let fixture: TestBusiness, other: TestBusiness;
  let owner: SupabaseClient, finance: SupabaseClient;
  const initialExpectationId = randomUUID();
  const expenseId = randomUUID();
  const foreignTaskId = randomUUID();
  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> { expect(result.error).toBeNull(); return result as Extract<T, { error: null }>; }
  beforeAll(async () => {
    fixture = await createTestBusiness(); other = await createTestBusiness();
    owner = await signInAs(fixture.accounts.owner); finance = await signInAs(fixture.accounts.finance);
    checked(await admin.from("expenses").insert({ id: expenseId, business_id: fixture.id, label: "Friday obligations", payee: "Fictional employees and suppliers", amount_cents: 8_000_000, due_date: "2026-10-30" }));
    checked(await admin.from("followups").insert({ id: foreignTaskId, business_id: other.id, invoice_id: other.invoiceId, assignee_id: other.accounts.owner.id, due_date: "2026-10-29", next_action: "Other business task" }));
  });
  beforeEach(async () => {
    if (fixture.name !== "test-" + fixture.id) throw new Error("Refusing a non-fixture reset.");
    checked(await admin.from("followups").delete().eq("business_id", fixture.id));
    (await Promise.all(["expectations", "reminders", "audit_events", "command_receipts"].map(table => admin.from(table).delete().eq("business_id", fixture.id)))).forEach(checked);
    checked(await admin.from("cash_movements").delete().eq("business_id", fixture.id));
    checked(await admin.from("invoices").update({ amount_cents: 5_000_000, due_date: "2026-10-29", version: 1 }).eq("id", fixture.invoiceId));
    checked(await admin.from("businesses").update({ opening_cash_cents: 4_000_000, opening_date: "2026-10-26", opening_locked_at: null, revision: 0, demo_reference_date: "2026-10-29" }).eq("id", fixture.id).eq("name", fixture.name));
    checked(await admin.from("expectations").insert({ id: initialExpectationId, business_id: fixture.id, invoice_id: fixture.invoiceId, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-10-29", kind: "assumption", source_note: "Initial fictional due-date assumption.", confirmed_by: fixture.accounts.owner.id }));
  });
  afterAll(async () => { await owner?.auth.signOut({ scope: "local" }); await finance?.auth.signOut({ scope: "local" }); if(other) await disposeTestBusiness(other); if(fixture) await disposeTestBusiness(fixture); });
  async function snapshot() { return checked(await owner.rpc("workspace_snapshot")).data; }
  async function command(type: string, payload: object) { return { requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type, payload }; }
  function promise(extra: object = {}) { return { invoiceId: fixture.invoiceId, amountCents: 5_000_000, date: "2026-11-02", kind: "commitment", sourceNote: "We will pay on Monday.", nextFollowupDate: "2026-11-03", assigneeId: fixture.accounts.finance.id, ...extra }; }
  async function confirm(extra: object = {}) { return checked(await callCommand(finance, await command("confirm_expectation", promise(extra)))).data; }
  async function saveTask(extra: object = {}) { return checked(await callCommand(finance, await command("save_followup", { invoiceId: fixture.invoiceId, assigneeId: fixture.accounts.finance.id, date: "2026-10-29", nextAction: "Check receipt with the bank.", ...extra }))).data; }

  it("confirms a customer promise without changing actual cash or the original invoice date", async () => {
    const input = await command("confirm_expectation", promise());
    const result = checked(await callCommand(finance, input)).data;
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(4_000_000);
    expect(saved.invoices[0]).toMatchObject({ outstanding_cents: 5_000_000, due_date: "2026-10-29" });
    expect(saved.expectations).toMatchObject([{ id: result.recordId, kind: "commitment", state: "active", remaining_cents: 5_000_000, expected_date: "2026-11-02" }]);
    expect(saved.followups).toMatchObject([{ assignee_id: fixture.accounts.finance.id, due_date: "2026-11-03", state: "open" }]);
    expect(calculateForecast(saved.forecastInput).days[1].closingCents).toBe(-4_000_000);
    expect(checked(await owner.from("cash_movements").select("id")).data).toEqual([]);
    expect(checked(await callCommand(finance, input)).data).toMatchObject({ ...result, replayed: true });
    expect(checked(await owner.from("expectations").select("id").eq("state", "active")).data).toHaveLength(1);
    expect((await snapshot()).followups).toHaveLength(1);
  });
  it("retains an installment message and leaves a partial promise's unplanned remainder visible", async () => {
    const sourceNote = "30,000 Monday, then 20,000 Friday. Staff selected only the Monday receipt.";
    await confirm({ amountCents: 3_000_000, sourceNote });
    const saved = await snapshot();
    expect(saved.expectations[0]).toMatchObject({ remaining_cents: 3_000_000, source_note: sourceNote, expected_date: "2026-11-02" });
    expect(calculateForecast(saved.forecastInput).incompleteInvoiceIds).toContain(fixture.invoiceId);
    expect(saved.invoices[0].outstanding_cents).toBe(5_000_000);
  });
  it("supersedes prior plans, resolves their automatic tasks and reuses the open manual follow-up", async () => {
    const first = await confirm(); const saved = await snapshot(); const manualId = saved.followups[0].id;
    const autoId = randomUUID(), humanId = randomUUID();
    checked(await admin.from("followups").insert([
      { id: autoId, business_id: fixture.id, invoice_id: fixture.invoiceId, expectation_id: first.recordId, assignee_id: fixture.accounts.finance.id, due_date: "2026-11-03", next_action: "Old missed promise", automatic_type: "missed_commitment", state: "open" },
      { id: humanId, business_id: fixture.id, invoice_id: fixture.invoiceId, assignee_id: fixture.accounts.owner.id, due_date: "2026-10-29", next_action: "Old call", state: "completed", completion_source: "human", outcome: "Called customer.", completed_at: new Date().toISOString() },
    ]));
    const second = await confirm({ amountCents: 3_000_000, date: "2026-11-04", nextFollowupDate: "2026-11-05", assigneeId: fixture.accounts.owner.id });
    expect(checked(await owner.from("expectations").select("state").eq("id", first.recordId).single()).data.state).toBe("superseded");
    expect(checked(await owner.from("followups").select("*").eq("id", autoId).single()).data).toMatchObject({ state: "completed", completion_source: "human", resolved_by_movement_id: null });
    expect(checked(await owner.from("followups").select("*").eq("id", manualId).single()).data).toMatchObject({ state: "open", expectation_id: second.recordId, due_date: "2026-11-05", assignee_id: fixture.accounts.owner.id });
    expect(checked(await owner.from("followups").select("state,outcome").eq("id", humanId).single()).data).toEqual({ state: "completed", outcome: "Called customer." });
    expect((await snapshot()).expectations).toHaveLength(1);
  });
  it.each([{ amountCents: 5_000_001 }, { amountCents: 0 }, { sourceNote: " " }, { date: "2026-02-30" }, { nextFollowupDate: "2026-10-28" }, { kind: "paid" }, { role: "owner" }])("rejects invalid promise %j atomically", async invalid => {
    expect((await callCommand(finance, await command("confirm_expectation", promise(invalid)))).error?.message).toBe("VALIDATION_ERROR");
    expect((await snapshot()).revision).toBe(0);
    expect(checked(await owner.from("audit_events").select("id")).data).toEqual([]);
  });
  it("retains a past promise as needs-review and excludes it from future money", async () => {
    await confirm({ date: "2026-10-28", nextFollowupDate: "2026-10-29" });
    const saved = await snapshot();
    expect(saved.expectations[0].state).toBe("needs_review");
    expect(calculateForecast(saved.forecastInput).days[0].expectedInCents).toBe(0);
  });
  it("rejects anonymous, foreign-invoice and foreign-assignee changes", async () => {
    expect((await callCommand(anonymous, await command("confirm_expectation", promise()))).error).not.toBeNull();
    expect((await callCommand(owner, await command("confirm_expectation", promise({ invoiceId: other.invoiceId })))).error?.message).toBe("NOT_FOUND");
    expect((await callCommand(finance, await command("confirm_expectation", promise({ assigneeId: other.accounts.owner.id })))).error?.message).toBe("NOT_FOUND");
    expect((await callCommand(finance, await command("complete_followup", { id: foreignTaskId, outcome: "Foreign", assigneeId: fixture.accounts.finance.id }))).error?.message).toBe("NOT_FOUND");
  });
  it("rejects stale and simultaneous confirmations without multiple current promises", async () => {
    const first = await command("confirm_expectation", promise());
    const second = { ...first, requestId: randomUUID(), payload: promise({ date: "2026-11-04" }) };
    const results = await Promise.all([callCommand(owner, first), callCommand(finance, second)]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(results.find(result => result.error)?.error?.message).toBe("STALE_VERSION");
    expect((await snapshot()).expectations).toHaveLength(1);
  });
  it("creates and edits an open assigned follow-up without changing cash", async () => {
    const created = await saveTask();
    await saveTask({ id: created.recordId, date: "2026-11-02", assigneeId: fixture.accounts.owner.id, nextAction: "Call the accounts contact." });
    const saved = await snapshot();
    expect(saved.followups).toMatchObject([{ id: created.recordId, due_date: "2026-11-02", assignee_id: fixture.accounts.owner.id, next_action: "Call the accounts contact." }]);
    expect(saved.forecastInput.availableCents).toBe(4_000_000);
    expect((await callCommand(owner, await command("save_followup", { invoiceId: fixture.invoiceId, assigneeId: other.accounts.owner.id, date: "2026-11-02", nextAction: "Invalid assignment" }))).error?.message).toBe("NOT_FOUND");
  });
  it("requires an outcome, next action/date and valid assignee while money remains unpaid", async () => {
    const created = await saveTask();
    for (const invalid of [{ outcome: "" }, { nextAction: undefined }, { nextDate: "2026-10-28" }, { assigneeId: other.accounts.owner.id }]) {
      const payload = { id: created.recordId, outcome: "Called customer", nextAction: "Check receipt", nextDate: "2026-11-03", assigneeId: fixture.accounts.finance.id, ...invalid };
      const result = await callCommand(finance, await command("complete_followup", payload));
      expect(result.error?.message).toBe(invalid.assigneeId ? "NOT_FOUND" : "VALIDATION_ERROR");
    }
    expect((await snapshot()).followups[0].state).toBe("open");
  });
  it("completes a task with one next action, retains its outcome, and never records a payment", async () => {
    const created = await saveTask();
    const payload = { id: created.recordId, outcome: "Customer confirmed Monday", nextAction: "Verify receipt", nextDate: "2026-11-03", assigneeId: fixture.accounts.owner.id };
    const input = await command("complete_followup", payload);
    checked(await callCommand(finance, input)); checked(await callCommand(finance, input));
    const saved = await snapshot();
    expect(saved.followups).toHaveLength(2);
    expect(saved.followups.find((row: { id: string }) => row.id === created.recordId)).toMatchObject({ state: "completed", completion_source: "human", outcome: payload.outcome, next_date: payload.nextDate });
    expect(saved.followups.find((row: { state: string }) => row.state === "open")).toMatchObject({ next_action: "Verify receipt", due_date: payload.nextDate, assignee_id: fixture.accounts.owner.id });
    expect(saved.forecastInput.availableCents).toBe(4_000_000);
    expect((await callCommand(owner, await command("complete_followup", payload))).error?.message).toBe("VALIDATION_ERROR");
    expect((await callCommand(owner, await command("save_followup", { id: created.recordId, invoiceId: fixture.invoiceId, date: "2026-11-04", nextAction: "Cannot reopen", assigneeId: fixture.accounts.owner.id }))).error?.message).toBe("VALIDATION_ERROR");
  });
  it("allows a paid invoice's task to close without creating a new unpaid follow-up", async () => {
    const created = await saveTask();
    checked(await callCommand(finance, await command("post_cash_movement", { kind: "receipt", parentId: fixture.invoiceId, amountCents: 5_000_000, date: "2026-10-29", reference: "FULL" })));
    checked(await callCommand(owner, await command("complete_followup", { id: created.recordId, outcome: "Payment verified", assigneeId: fixture.accounts.owner.id })));
    expect((await snapshot()).followups).toMatchObject([{ id: created.recordId, state: "completed" }]);
  });
  it("requires explicit reconfirmation after a void, retaining the lower current promise", async () => {
    const paid = checked(await callCommand(finance, await command("post_cash_movement", { kind: "receipt", parentId: fixture.invoiceId, amountCents: 2_000_000, date: "2026-10-29", reference: "PARTIAL" }))).data;
    checked(await callCommand(owner, await command("void_cash_movement", { movementId: paid.recordId, reason: "Checked incorrect entry." })));
    await confirm({ amountCents: 3_000_000 });
    const saved = await snapshot();
    expect(saved.forecastInput.availableCents).toBe(4_000_000);
    expect(saved.expectations[0]).toMatchObject({ state: "active", remaining_cents: 3_000_000 });
    expect(saved.followups.find((row: { automatic_type: string }) => row.automatic_type === "correction_review").state).toBe("completed");
  });
  it("invalidates approved reminders and exposes paginated collection changes in invoice history", async () => {
    checked(await admin.from("reminders").insert({ business_id: fixture.id, invoice_id: fixture.invoiceId, recipient: "Contact", body: "Reminder", state: "approved", approval_basis: {}, reviewed_by: fixture.accounts.owner.id, reviewed_at: new Date().toISOString() }));
    checked(await admin.from("audit_events").insert(Array.from({ length: 25 }, (_, index) => ({ business_id: fixture.id, actor_id: fixture.accounts.owner.id, entity_kind: "invoice", entity_id: fixture.invoiceId, change: { fixtureIndex: index }, created_at: "2026-10-20T00:00:00Z" }))));
    await confirm();
    expect(checked(await owner.from("reminders").select("state,approval_basis").single()).data).toEqual({ state: "draft", approval_basis: null });
    const first = checked(await owner.rpc("workspace_history", { p_kind: "invoice", p_id: fixture.invoiceId })).data;
    const second = checked(await owner.rpc("workspace_history", { p_kind: "invoice", p_id: fixture.invoiceId, p_cursor: first.nextCursor })).data;
    expect(first.events).toHaveLength(20); expect(second.events).toHaveLength(6);
    expect(new Set([...first.events, ...second.events].map((row: { id: string }) => row.id)).size).toBe(26);
    expect(first.events[0].change.operation).toBe("confirm_expectation");
  });
  it("rolls back a late follow-up failure after supersession and insertion", async () => {
    const manualId = randomUUID();
    checked(await admin.from("followups").insert({ id: manualId, business_id: fixture.id, invoice_id: fixture.invoiceId, expectation_id: initialExpectationId, assignee_id: fixture.accounts.finance.id, due_date: "2026-10-29", next_action: "Existing follow-up", version: 2_147_483_647 }));
    expect((await callCommand(finance, await command("confirm_expectation", promise()))).error).not.toBeNull();
    const saved = await snapshot();
    expect(saved.revision).toBe(0);
    expect(saved.expectations).toMatchObject([{ id: initialExpectationId, state: "active" }]);
    expect(checked(await owner.from("audit_events").select("id")).data).toEqual([]);
    expect(checked(await owner.from("command_receipts").select("request_id")).data).toEqual([]);
  });
});
