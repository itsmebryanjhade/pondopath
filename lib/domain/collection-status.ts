import type { ForecastInvoice, LocalDate } from "./types";

export const collectionFilters = {
  all: "All invoices",
  unpaid: "Unpaid",
  due: "Due today",
  overdue: "Overdue",
  commitment: "Customer commitment",
  needs_review: "Needs review",
  no_expectation: "No expectation",
  no_followup: "No next follow-up",
} as const;
export type CollectionFilter = keyof typeof collectionFilters;

export function collectionFlags(
  invoice: ForecastInvoice & { dueDate: LocalDate; hasOpenFollowup: boolean },
  referenceDate: LocalDate,
) {
  const unpaid = invoice.outstandingCents > 0;
  const needsReview =
    !!invoice.expectation &&
    (invoice.expectation.needsReview || invoice.expectation.date < referenceDate);
  return {
    unpaid,
    due: unpaid && invoice.dueDate === referenceDate,
    overdue: unpaid && invoice.dueDate < referenceDate,
    commitment: unpaid && invoice.expectation?.kind === "commitment",
    needs_review: unpaid && needsReview,
    no_expectation: unpaid && !invoice.expectation,
    no_followup: unpaid && !invoice.hasOpenFollowup,
    unplannedCents: unpaid
      ? invoice.outstandingCents - (needsReview ? 0 : (invoice.expectation?.remainingCents ?? 0))
      : 0,
  };
}
