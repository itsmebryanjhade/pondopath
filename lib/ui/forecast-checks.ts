import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import type { ForecastResult } from "@/lib/domain/types";
import { expenseLinks, formatPlanDate } from "@/lib/display";
import { formatPHP } from "@/lib/domain/money";

export type CheckRecord = { id: string; label: string; detail: string; href: string; action: string };
export type ForecastCheck = { key: "past-date" | "no-date" | "overdue-bills"; title: string; note: string; records: CheckRecord[]; more?: { label: string; href: string } };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The forecast's assumptions in plain words, each naming the records behind it and where to fix them. */
export function forecastChecks(workspace: WorkspaceSnapshot, forecast: ForecastResult, origin: "overview" | "forecast" = "overview"): ForecastCheck[] {
  const checks: ForecastCheck[] = [];
  // Opens the invoice with its payment-date editor open; from the Overview its back link returns there.
  const planHref = (id: string) => `/invoices/${id}?${origin === "overview" ? "from=overview&" : ""}plan=edit#collection-plan`;
  const customer = (id: string) => workspace.customers.find((row) => row.id === id)?.name ?? "Customer unavailable";

  const stale = new Set(forecast.staleExpectationIds);
  const pastDates = workspace.forecastInput.invoices.flatMap((planned) => {
    if (!planned.expectation || !stale.has(planned.expectation.id)) return [];
    const invoice = workspace.invoices.find((row) => row.id === planned.id);
    if (!invoice) return [];
    return [{ id: invoice.id, label: invoice.number, detail: `${customer(invoice.customer_id)} · expected ${formatPlanDate(planned.expectation.date, true)}`,
      href: planHref(invoice.id), action: "Update date" }];
  });
  if (pastDates.length) checks.push({
    key: "past-date",
    title: `${plural(pastDates.length, "expected payment date has", "expected payment dates have")} passed`,
    note: "Left out of the forecast until you set a new date or record the payment.",
    records: pastDates,
  });

  const stalePlanned = new Set(pastDates.map((item) => item.id));
  const noDate = forecast.incompleteInvoiceIds.filter((id) => !stalePlanned.has(id)).flatMap((id) => {
    const invoice = workspace.invoices.find((row) => row.id === id);
    const planned = workspace.forecastInput.invoices.find((row) => row.id === id);
    if (!invoice || !planned) return [];
    const unplanned = planned.outstandingCents - (planned.expectation?.remainingCents ?? 0);
    return [{ id, label: invoice.number, detail: `${customer(invoice.customer_id)} · ${formatPHP(unplanned > 0 ? unplanned : planned.outstandingCents)} with no expected date`,
      href: planHref(id), action: "Set date" }];
  });
  if (noDate.length) checks.push({
    key: "no-date",
    title: `Incomplete plan: ${plural(noDate.length, "unpaid invoice has", "unpaid invoices have")} money with no expected date`,
    note: "That money isn't in the forecast until you set when it should arrive.",
    records: noDate,
  });

  const overdue = new Set(forecast.overdueExpenseIds);
  const hrefs = expenseLinks(workspace.expenses);
  const bills = workspace.expenses.filter((expense) => overdue.has(expense.id)).map((expense) => ({
    id: expense.id, label: expense.payee || expense.label, detail: `${expense.label} · due ${formatPlanDate(expense.due_date, true)} · ${formatPHP(expense.unpaid_cents)}`,
    href: hrefs.get(expense.id) ?? "/expenses", action: "View bill",
  }));
  if (bills.length) checks.push({
    key: "overdue-bills",
    title: `${plural(bills.length, "overdue bill is", "overdue bills are")} counted as due today`,
    note: "Record the payment if it's already paid, or change its due date.",
    records: bills,
    more: { label: "View all bills", href: "/expenses" },
  });
  return checks;
}
