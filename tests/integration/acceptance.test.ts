import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { calculateForecast, compareScenario } from "../../lib/domain/forecast";
import type { WorkspaceSnapshot } from "../../lib/server/workspace";
import { admin, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

const fixtures: TestBusiness[] = [];
const checked = <T>(result: { data: T; error: unknown }): T => {
  expect(result.error).toBeNull();
  return result.data;
};
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await disposeTestBusiness(fixture);
});

async function verifyAcceptanceFixture() {
  const fixture = await createTestBusiness();
  fixtures.push(fixture);
  const owner = await signInAs(fixture.accounts.owner);
  const finance = await signInAs(fixture.accounts.finance);
  const expenseId = randomUUID();
  checked(await admin.from("expenses").insert({ id: expenseId, business_id: fixture.id, label: "Friday obligations", payee: "Fictional payroll and suppliers", amount_cents: 8_000_000, due_date: "2026-10-30" }));
  const snapshot = async () => checked(await owner.rpc("workspace_snapshot")) as WorkspaceSnapshot;
  const command = async (type: string, payload: object, client = finance) => ({ requestId: randomUUID(), expectedRevision: (await snapshot()).revision, type, payload, client });
  const save = async (type: string, payload: object, client = finance) => {
    const { client: actor, ...input } = await command(type, payload, client);
    return checked(await callCommand(actor, input));
  };
  const plan = (date: string) => ({ invoiceId: fixture.invoiceId, amountCents: 5_000_000, date, kind: "commitment", sourceNote: "Fictional customer confirms payment on this date.", nextFollowupDate: date, assigneeId: fixture.accounts.finance.id });
  return { fixture, owner, finance, expenseId, snapshot, command, save, plan };
}

describe("integrated PRD acceptance journeys", () => {
  it("AC-02/03/04/07/10/12: follows the promise, approved reminder, partial receipt and correction journey", async () => {
    const { fixture, owner, finance, snapshot, save, plan, command } = await verifyAcceptanceFixture();
    await save("confirm_expectation", plan("2026-10-29"));
    const initial = await snapshot();
    expect(calculateForecast(initial.forecastInput).days[1].closingCents).toBe(1_000_000);
    const preserved = structuredClone(initial);
    const scenario = compareScenario(initial.forecastInput, { invoiceId: fixture.invoiceId, date: "2026-11-02", amountCents: 5_000_000 });
    expect(scenario.scenario.firstShortage).toEqual({ date: "2026-10-30", shortfallCents: 4_000_000 });
    expect(initial).toEqual(preserved);
    expect((await snapshot()).revision).toBe(initial.revision);
    await save("confirm_expectation", plan("2026-11-02"));
    expect(calculateForecast((await snapshot()).forecastInput).days[1].closingCents).toBe(-4_000_000);
    const draft = await save("save_reminder", { invoiceId: fixture.invoiceId, recipient: "fictional@example.com", body: "Please confirm your outstanding PHP 50,000 payment for INV-001." });
    await save("submit_reminder", { id: draft.recordId, reminderVersion: 1 });
    const pending = checked(await owner.from("reminders").select("*").eq("id", draft.recordId).single());
    const approval = { id: draft.recordId, reminderVersion: pending.version, approvalBasis: pending.approval_basis.digest };
    const { client: ignored, ...forbidden } = await command("approve_reminder", approval);
    void ignored;
    expect((await callCommand(finance, forbidden)).error?.message).toBe("FORBIDDEN");
    await save("approve_reminder", approval, owner);
    const { client: actor, ...receipt } = await command("post_cash_movement", { kind: "receipt", parentId: fixture.invoiceId, amountCents: 2_000_000, date: "2026-10-29", reference: "AC-PARTIAL" });
    const posted = checked(await callCommand(actor, receipt));
    expect(checked(await callCommand(actor, receipt)).replayed).toBe(true);
    const partial = await snapshot();
    expect(partial.forecastInput.availableCents).toBe(6_000_000);
    expect(partial.invoices[0].outstanding_cents).toBe(3_000_000);
    expect(partial.expectations[0].remaining_cents).toBe(3_000_000);
    expect(calculateForecast(partial.forecastInput).days[1].closingCents).toBe(-2_000_000);
    expect(checked(await owner.from("reminders").select("state").eq("id", draft.recordId).single())?.state).not.toBe("approved");
    await save("void_cash_movement", { movementId: posted.recordId, reason: "Acceptance check: wrong receipt reference." }, owner);
    const corrected = await snapshot();
    expect(corrected.forecastInput.availableCents).toBe(4_000_000);
    expect(corrected.invoices[0].outstanding_cents).toBe(5_000_000);
    expect(corrected.forecastInput.invoices[0].expectation?.needsReview).toBe(true);
    expect(calculateForecast(corrected.forecastInput).incompleteInvoiceIds).toContain(fixture.invoiceId);
    expect(corrected.followups.filter(row => row.correction_movement_id === posted.recordId && row.state === "open")).toHaveLength(1);
    await finance.auth.signOut({ scope: "local" });
    const again = await signInAs(fixture.accounts.finance);
    expect(checked(await again.rpc("workspace_snapshot")).forecastInput.availableCents).toBe(4_000_000);
    await again.auth.signOut({ scope: "local" });
    await owner.auth.signOut({ scope: "local" });
  });

  it("AC-05/06/11/12: preserves expenses and handles missed promises without duplicating tasks or cash", async () => {
    const { fixture, owner, finance, expenseId, snapshot, save, plan, command } = await verifyAcceptanceFixture();
    await save("confirm_expectation", plan("2026-10-29"));
    checked(await admin.from("businesses").update({ demo_reference_date: "2026-10-31" }).eq("id", fixture.id).eq("name", fixture.name));
    const stale = calculateForecast((await snapshot()).forecastInput);
    expect(stale.staleExpectationIds).toHaveLength(1);
    expect(stale.days[0].expectedInCents).toBe(0);
    expect(stale.overdueExpenseIds).toEqual([expenseId]);
    checked(await finance.rpc("check_missed_commitments"));
    checked(await finance.rpc("check_missed_commitments"));
    expect((await snapshot()).followups.filter(row => row.automatic_type === "missed_commitment")).toHaveLength(1);
    await save("post_cash_movement", { kind: "expense_payment", parentId: expenseId, amountCents: 1_000_000, date: "2026-10-29", reference: "AC-EXPENSE" });
    const paid = await snapshot();
    expect(paid.forecastInput.availableCents).toBe(3_000_000);
    expect(paid.expenses[0].unpaid_cents).toBe(7_000_000);
    expect(calculateForecast(paid.forecastInput).days[1].closingCents).toBe(-4_000_000);
    const { client: ignored, ...invalid } = await command("post_cash_movement", { kind: "expense_payment", parentId: expenseId, amountCents: 7_000_001, date: "2026-10-29", reference: "AC-INVALID" });
    void ignored;
    expect((await callCommand(finance, invalid)).error?.message).toBe("VALIDATION_ERROR");
    expect((await snapshot()).revision).toBe(paid.revision);
    const a = { requestId: randomUUID(), expectedRevision: paid.revision, type: "save_customer", payload: { name: "First session", contactName: "Test" } };
    checked(await callCommand(owner, a));
    expect((await callCommand(finance, { ...a, requestId: randomUUID(), payload: { name: "Stale session", contactName: "Test" } })).error?.message).toBe("STALE_VERSION");
    await owner.auth.signOut({ scope: "local" });
    await finance.auth.signOut({ scope: "local" });
  });
});
