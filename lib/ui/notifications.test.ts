import { describe, expect, it } from "vitest";
import { buildActivityRows } from "@/lib/ui/cash-overview";
import { buildAlerts } from "@/lib/ui/notifications";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

function workspace() {
  const value = uiWorkspace();
  // Today is 29 Oct. Payroll is 4 days late, the supplier bill isn't due yet, rent is due later.
  value.expenses[0].due_date = "2026-10-25";
  value.expenses[1].due_date = "2026-11-05";
  value.expenses[2].due_date = "2026-11-20";
  return value;
}

describe("notification bell", () => {
  it("groups what needs someone now, with amounts and how late each item is", () => {
    const value = workspace();
    value.followups = [{
      id: "task-1", invoice_id: value.invoices[0].id, business_id: value.business.id, assignee_id: value.actor.userId,
      due_date: "2026-10-29", next_action: "Call Demo customer", next_date: null, outcome: null, automatic_type: null,
      expectation_id: null, correction_movement_id: null, resolved_by_movement_id: null, completion_source: null,
      completed_at: null, created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", version: 1, state: "open",
    }];
    value.intakeReviews = [{ id: "row-1", external_id: "A1", status: "pending" }, { id: "row-2", external_id: "A2", status: "pending" }] as typeof value.intakeReviews;
    const alerts = buildAlerts(value, buildActivityRows(value));

    expect(alerts.groups.map((group) => group.key)).toEqual(["bills", "collect", "followups", "review"]);
    expect(alerts.groups[0].items).toEqual([expect.objectContaining({ title: "Payroll", detail: "Demo team", when: "4 days late", late: true })]);
    expect(alerts.groups[1].items[0]).toMatchObject({ title: "DEMO-001", detail: "Demo customer", amountCents: 5_000_000, when: "1 day late" });
    expect(alerts.groups[2].items[0]).toMatchObject({ title: "Call Demo customer", when: "Due today", href: `/invoices/${value.invoices[0].id}#followup-task-1` });
    expect(alerts.groups[3].items[0].title).toBe("2 imported rows waiting");
    expect(alerts.count).toBe(1 + 1 + 1 + 2);
    expect(alerts.urgent).toBe(true);
    expect(alerts.overdueBillCents).toBe(value.expenses[0].unpaid_cents);
    expect(alerts.overdueOwedCents).toBe(5_000_000);
  });

  it("is empty and calm when nothing needs attention", () => {
    const value = workspace();
    value.expenses = value.expenses.map((expense) => ({ ...expense, due_date: "2026-12-01" }));
    value.invoices = value.invoices.map((invoice) => ({ ...invoice, outstanding_cents: 0, paid_cents: invoice.amount_cents }));
    const alerts = buildAlerts(value, buildActivityRows(value));
    expect(alerts).toMatchObject({ count: 0, urgent: false, groups: [] });
  });
});
