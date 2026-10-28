import { describe, expect, it } from "vitest";
import { expectedReceiptLabel, formatPlanDate } from "@/lib/display";
import { delayedCase } from "../../tests/fixtures/business";

describe("cash plan display", () => {
  it("preserves Manila date-only values across a month/year boundary", () => {
    expect(formatPlanDate("2026-12-31")).toBe("31 Dec 2026");
    expect(formatPlanDate("2027-01-01", true)).toBe("1 Jan");
  });

  it("distinguishes absent, stale, exhausted and partial expectations", () => {
    const invoice = delayedCase().invoices[0];
    expect(expectedReceiptLabel(undefined, "2026-10-29")).toBe("Not entered");
    expect(expectedReceiptLabel({ ...invoice, expectation: null }, "2026-10-29")).toBe("Not entered");
    expect(expectedReceiptLabel(invoice, "2026-11-03")).toBe("Needs review");
    for (const change of [{ needsReview: true }, { remainingCents: 0 }]) {
      expect(expectedReceiptLabel({ ...invoice, expectation: { ...invoice.expectation!, ...change } }, "2026-10-29")).toBe("Needs review");
    }
    expect(expectedReceiptLabel(invoice, "2026-11-02")).toBe("2 Nov 2026");
    expect(expectedReceiptLabel({ ...invoice, expectation: { ...invoice.expectation!, remainingCents: 3_000_000 } }, "2026-10-29")).toBe("2 Nov 2026 · ₱30,000.00 expected; remainder unplanned");
  });
});
