import { describe, expect, it } from "vitest";
import { collectionFlags } from "./collection-status";
const invoice = {
  id: "invoice",
  outstandingCents: 5_000_000,
  dueDate: "2026-10-29",
  expectation: {
    id: "expectation",
    date: "2026-11-02",
    remainingCents: 3_000_000,
    kind: "commitment" as const,
    needsReview: false,
  },
  hasOpenFollowup: false,
};
describe("collection attention filters", () => {
  it("flags an unpaid invoice due today and preserves its unplanned remainder", () => {
    expect(collectionFlags(invoice, "2026-10-29")).toMatchObject({
      unpaid: true,
      due: true,
      overdue: false,
      commitment: true,
      no_followup: true,
      unplannedCents: 2_000_000,
    });
  });
  it("excludes an expired promise's whole balance and requires review", () => {
    expect(
      collectionFlags(
        {
          ...invoice,
          expectation: { ...invoice.expectation, date: "2026-10-28" },
          hasOpenFollowup: true,
        },
        "2026-10-29",
      ),
    ).toMatchObject({ needs_review: true, no_followup: false, unplannedCents: 5_000_000 });
  });
  it("identifies missing expectations and strictly overdue invoices", () => {
    expect(
      collectionFlags({ ...invoice, dueDate: "2026-10-28", expectation: null }, "2026-10-29"),
    ).toMatchObject({ overdue: true, due: false, no_expectation: true, unplannedCents: 5_000_000 });
  });
  it("does not flag paid invoices as needing a collection action", () => {
    expect(
      collectionFlags({ ...invoice, outstandingCents: 0, expectation: null }, "2026-10-29"),
    ).toEqual({
      unpaid: false,
      due: false,
      overdue: false,
      commitment: false,
      needs_review: false,
      no_expectation: false,
      no_followup: false,
      unplannedCents: 0,
    });
  });
});
