import { formatPHP } from "./domain/money";
import type { ForecastInvoice, LocalDate } from "./domain/types";

export function formatPlanDate(value: LocalDate, compact = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: compact ? undefined : "numeric", timeZone: "Asia/Manila",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function expectedReceiptLabel(invoice: ForecastInvoice | undefined, referenceDate: LocalDate): string {
  if (!invoice?.expectation) return "Not entered";
  const expectation = invoice.expectation;
  if (expectation.needsReview || expectation.date < referenceDate || expectation.remainingCents <= 0) return "Needs review";
  const partial = expectation.remainingCents < invoice.outstandingCents;
  return `${formatPlanDate(expectation.date)}${partial ? ` · ${formatPHP(expectation.remainingCents)} expected; remainder unplanned` : ""}`;
}

export function expenseLinks(expenses: readonly { id: string; due_date: LocalDate }[]): Map<string, string> {
  return new Map([...expenses].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id)).map((expense, index) => {
    const page = Math.floor(index / 50) + 1;
    return [expense.id, `/expenses${page > 1 ? `?page=${page}` : ""}#expense-${expense.id}`];
  }));
}

/** When a follow-up is due, in words, with a tone for its chip. */
export function followupDue(due: LocalDate, today: LocalDate): { text: string; tone: "late" | "today" | "later" } {
  if (due < today) return { text: `Late since ${formatPlanDate(due, true)}`, tone: "late" };
  if (due === today) return { text: "Due today", tone: "today" };
  return { text: `Due ${formatPlanDate(due, true)}`, tone: "later" };
}

