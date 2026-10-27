import type { ForecastInput } from "../../lib/domain/types";

export function initialCase(): ForecastInput {
  return {
    referenceDate: "2026-10-26",
    availableCents: 4_000_000,
    invoices: [{
      id: "10000000-0000-4000-8000-000000000001",
      outstandingCents: 5_000_000,
      expectation: {
        id: "20000000-0000-4000-8000-000000000001",
        date: "2026-10-29",
        remainingCents: 5_000_000,
        kind: "assumption",
        needsReview: false,
      },
    }],
    expenses: [
      { id: "30000000-0000-4000-8000-000000000001", dueDate: "2026-10-30", unpaidCents: 5_000_000 },
      { id: "30000000-0000-4000-8000-000000000002", dueDate: "2026-10-30", unpaidCents: 2_000_000 },
      { id: "30000000-0000-4000-8000-000000000003", dueDate: "2026-10-30", unpaidCents: 1_000_000 },
    ],
  };
}

export function delayedCase(): ForecastInput {
  const input = initialCase();
  input.invoices[0].expectation!.date = "2026-11-02";
  input.invoices[0].expectation!.kind = "commitment";
  return input;
}

export function partialCase(): ForecastInput {
  const input = delayedCase();
  input.referenceDate = "2026-10-29";
  input.availableCents = 6_000_000;
  input.invoices[0].outstandingCents = 3_000_000;
  input.invoices[0].expectation!.remainingCents = 3_000_000;
  return input;
}
