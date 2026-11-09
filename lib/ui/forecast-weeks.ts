import { checkedSum } from "@/lib/domain/money";
import type { ForecastInput, ForecastResult } from "@/lib/domain/types";

export type ForecastWeekItem = { kind: "in" | "out"; id: string; date: string; cents: number };

export type ForecastWeek = {
  /** First and last day this row covers (a run of quiet weeks is one row). */
  firstDate: string;
  lastDate: string;
  /** True when nothing is expected in or planned out across the whole span. */
  quiet: boolean;
  inCents: number;
  outCents: number;
  /** The invoices and bills the forecast counted in this span, by day. */
  items: ForecastWeekItem[];
};

/**
 * Splits the forecast into 7-day weeks, lists the invoices and bills the forecast counted on each day,
 * and merges back-to-back quiet weeks into one row. Amounts are exactly what the forecast added for each
 * record (an invoice's expected remaining amount, a bill's unpaid amount); nothing is recalculated.
 */
export function forecastWeeks(days: ForecastResult["days"], input: Pick<ForecastInput, "invoices" | "expenses">): ForecastWeek[] {
  const invoiceCents = new Map(input.invoices.map((invoice) => [invoice.id, invoice.expectation?.remainingCents ?? 0]));
  const expenseCents = new Map(input.expenses.map((expense) => [expense.id, expense.unpaidCents]));
  const spans: ForecastWeek[] = [];
  for (let offset = 0; offset < days.length; offset += 7) {
    const week = days.slice(offset, offset + 7);
    const items: ForecastWeekItem[] = week.flatMap((day) => [
      ...day.expenseIds.map((id) => ({ kind: "out" as const, id, date: day.date, cents: expenseCents.get(id) ?? 0 })),
      ...day.invoiceIds.map((id) => ({ kind: "in" as const, id, date: day.date, cents: invoiceCents.get(id) ?? 0 })),
    ]);
    const next: ForecastWeek = {
      firstDate: week[0].date,
      lastDate: week[week.length - 1].date,
      inCents: checkedSum(week.map((day) => day.expectedInCents)),
      outCents: checkedSum(week.map((day) => day.plannedOutCents)),
      quiet: false,
      items,
    };
    next.quiet = next.inCents === 0 && next.outCents === 0;
    const previous = spans.at(-1);
    if (next.quiet && previous?.quiet) {
      previous.lastDate = next.lastDate;
      continue;
    }
    spans.push(next);
  }
  return spans;
}
