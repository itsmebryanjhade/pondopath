import { describe, expect, it } from "vitest";
import { delayedCase, initialCase, partialCase } from "../../tests/fixtures/business";
import { calculateForecast, compareScenario } from "./forecast";
import type { ForecastInput } from "./types";

function freezeFixture(value: object): void {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") freezeFixture(child);
  }
}

describe("calculateForecast", () => {
  it("shows the initial balance and the inclusive 30-day sample horizon", () => {
    const result = calculateForecast(initialCase());
    expect(result.days).toHaveLength(30);
    expect(result.days[0].date).toBe("2026-10-26");
    expect(result.days.at(-1)?.date).toBe("2026-11-24");
    expect(result.days.find((day) => day.date === "2026-10-30")?.closingCents).toBe(1_000_000);
    expect(result.firstShortage).toBeNull();
    expect(result.maxShortfallCents).toBe(0);
  });

  it("exposes the Friday gap even when Monday becomes positive", () => {
    const input = delayedCase();
    const result = calculateForecast(input);
    expect(result.firstShortage).toEqual({ date: "2026-10-30", shortfallCents: 4_000_000 });
    expect(result.maxShortfallCents).toBe(4_000_000);
    expect(result.days.find((day) => day.date === "2026-11-02")?.closingCents).toBe(1_000_000);
    expect(result.days.find((day) => day.date === "2026-10-30")?.expenseIds)
      .toEqual(input.expenses.map((expense) => expense.id));
    expect(result.days.find((day) => day.date === "2026-11-02")?.invoiceIds)
      .toEqual([input.invoices[0].id]);
  });

  it("counts a partial actual receipt only through available cash", () => {
    const result = calculateForecast(partialCase());
    expect(result.days[0].closingCents).toBe(6_000_000);
    expect(result.firstShortage?.shortfallCents).toBe(2_000_000);
    expect(result.days.find((day) => day.date === "2026-11-02")?.expectedInCents).toBe(3_000_000);
    expect(result.days.find((day) => day.date === "2026-11-02")?.closingCents).toBe(1_000_000);
  });

  it("does not count a paid part of an expense again", () => {
    const input = initialCase();
    input.availableCents -= 1_000_000;
    input.expenses[0].unpaidCents -= 1_000_000;
    expect(calculateForecast(input).days.find((day) => day.date === "2026-10-30")?.closingCents).toBe(1_000_000);
  });

  it("excludes stale receipts and retains overdue unpaid expenses on the new reference date", () => {
    const input = delayedCase();
    input.referenceDate = "2026-11-03";
    const result = calculateForecast(input);
    expect(result.days[0].expectedInCents).toBe(0);
    expect(result.days[0].plannedOutCents).toBe(8_000_000);
    expect(result.days[0].closingCents).toBe(-4_000_000);
    expect(result.staleExpectationIds).toEqual([input.invoices[0].expectation!.id]);
    expect(result.incompleteInvoiceIds).toEqual([input.invoices[0].id]);
    expect(result.overdueExpenseIds).toEqual(input.expenses.map((expense) => expense.id));
  });

  it("excludes needs-review expectations after a correction", () => {
    const input = initialCase();
    input.invoices[0].expectation!.needsReview = true;
    const result = calculateForecast(input);
    expect(result.firstShortage?.shortfallCents).toBe(4_000_000);
    expect(result.incompleteInvoiceIds).toEqual([input.invoices[0].id]);
  });

  it("flags a partial promise's unplanned remainder", () => {
    const input = initialCase();
    input.invoices[0].expectation!.remainingCents = 2_000_000;
    const result = calculateForecast(input);
    expect(result.incompleteInvoiceIds).toEqual([input.invoices[0].id]);
    expect(result.days.find((day) => day.date === "2026-10-29")?.expectedInCents).toBe(2_000_000);
  });

  it("keeps missing expectations visible without inventing dates", () => {
    const input = initialCase();
    input.invoices[0].expectation = null;
    expect(calculateForecast(input).incompleteInvoiceIds).toEqual([input.invoices[0].id]);
    expect(calculateForecast(input).days.every((day) => day.expectedInCents === 0)).toBe(true);
  });

  it("includes the final day and excludes receipts outside the horizon", () => {
    const input = initialCase();
    input.invoices[0].expectation!.date = "2026-11-24";
    expect(calculateForecast(input).days.at(-1)?.expectedInCents).toBe(5_000_000);
    input.invoices[0].expectation!.date = "2026-11-25";
    const result = calculateForecast(input);
    expect(result.days.every((day) => day.expectedInCents === 0)).toBe(true);
    expect(result.incompleteInvoiceIds).toEqual([]);
  });

  it("ignores settled balances and handles an empty business with zero buffer", () => {
    const input = initialCase();
    input.availableCents = 0;
    input.invoices[0].outstandingCents = 0;
    input.invoices[0].expectation!.remainingCents = 0;
    input.expenses.forEach((expense) => { expense.unpaidCents = 0; });
    const result = calculateForecast(input);
    expect(result.days.every((day) => day.closingCents === 0)).toBe(true);
    expect(result.firstShortage).toBeNull();
    expect(result.incompleteInvoiceIds).toEqual([]);
    expect(calculateForecast({ ...input, invoices: [], expenses: [] }).days).toHaveLength(30);
  });

  it("reports the first and largest shortfalls independently", () => {
    const input = initialCase();
    input.invoices = [];
    input.expenses[0].dueDate = "2026-10-27";
    const result = calculateForecast(input);
    expect(result.firstShortage).toEqual({ date: "2026-10-27", shortfallCents: 1_000_000 });
    expect(result.maxShortfallCents).toBe(4_000_000);
  });

  it("rejects invalid dates, fractional money, inconsistent expectations and aggregate overflow", () => {
    const invalidDate = initialCase();
    invalidDate.expenses[0].dueDate = "2026-02-30";
    expect(() => calculateForecast(invalidDate)).toThrow(RangeError);
    const fractional = initialCase();
    fractional.availableCents = 0.5;
    expect(() => calculateForecast(fractional)).toThrow(RangeError);
    const inconsistent = partialCase();
    inconsistent.invoices[0].expectation!.remainingCents = 5_000_000;
    expect(() => calculateForecast(inconsistent)).toThrow(RangeError);
    const overflow = initialCase();
    overflow.availableCents = Number.MAX_SAFE_INTEGER;
    expect(() => calculateForecast(overflow)).toThrow(RangeError);
  });

  it("rejects duplicate records rather than silently counting them twice", () => {
    const input = initialCase();
    input.invoices.push(structuredClone(input.invoices[0]));
    expect(() => calculateForecast(input)).toThrow(RangeError);
    const duplicateExpense = initialCase();
    duplicateExpense.expenses.push(structuredClone(duplicateExpense.expenses[0]));
    expect(() => calculateForecast(duplicateExpense)).toThrow(RangeError);
  });

  it("computes a deterministic 1,000-record dataset within the demo target", () => {
    const sample = initialCase();
    const input: ForecastInput = {
      referenceDate: sample.referenceDate,
      availableCents: 0,
      invoices: Array.from({ length: 500 }, (_, index) => ({
        id: "invoice-" + index,
        outstandingCents: 10_000,
        expectation: { ...sample.invoices[0].expectation!, id: "expectation-" + index, date: "2026-10-26", remainingCents: 10_000 },
      })),
      expenses: Array.from({ length: 500 }, (_, index) => ({ id: "expense-" + index, dueDate: "2026-10-27", unpaidCents: 10_000 })),
    };
    const start = performance.now();
    const result = calculateForecast(input);
    const elapsed = performance.now() - start;
    console.info("1,000-record forecast computation: " + elapsed.toFixed(2) + " ms");
    expect(result.days[0].closingCents).toBe(5_000_000);
    expect(result.days[1].closingCents).toBe(0);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("compareScenario", () => {
  it("compares before and after without mutating the deeply frozen input", () => {
    const input = initialCase();
    const original = structuredClone(input);
    freezeFixture(input);
    const result = compareScenario(input, { invoiceId: input.invoices[0].id, date: "2026-11-02", amountCents: 5_000_000 });
    expect(result.baseline.firstShortage).toBeNull();
    expect(result.scenario.firstShortage?.shortfallCents).toBe(4_000_000);
    expect(input).toEqual(original);
  });

  it("allows zero and a hypothetical date for a missing expectation", () => {
    const input = initialCase();
    input.invoices[0].expectation = null;
    const result = compareScenario(input, { invoiceId: input.invoices[0].id, date: "2026-10-29", amountCents: 0 });
    expect(result.scenario.days.every((day) => day.expectedInCents === 0)).toBe(true);
    expect(input.invoices[0].expectation).toBeNull();
  });

  it("rejects an unknown invoice, negative money and over-allocation", () => {
    const input = partialCase();
    const override = { invoiceId: input.invoices[0].id, date: "2026-11-02", amountCents: 3_000_000 };
    expect(() => compareScenario(input, { ...override, invoiceId: "missing" })).toThrow(RangeError);
    expect(() => compareScenario(input, { ...override, amountCents: -1 })).toThrow(RangeError);
    expect(() => compareScenario(input, { ...override, amountCents: 3_000_001 })).toThrow(RangeError);
  });
});
