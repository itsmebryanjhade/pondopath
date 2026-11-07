import { describe, expect, it } from "vitest";
import { overviewAnswer, workflowSteps } from "./overview";
import type { ForecastResult } from "@/lib/domain/types";

/** A 30-day forecast from 6 Nov: ₱40,000 recorded, ₱80,000 due 7 Nov, ₱12,500 expected 10 Nov. */
function forecast({ out = 8_000_000, inn = 1_250_000, start = 4_000_000 } = {}): ForecastResult {
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 6 + index)).toISOString().slice(0, 10);
    return { date, expectedInCents: index === 4 ? inn : 0, plannedOutCents: index === 1 ? out : 0, closingCents: 0, invoiceIds: [], expenseIds: [] };
  });
  let balance = start, firstShortage: ForecastResult["firstShortage"] = null;
  for (const day of days) {
    balance += day.expectedInCents - day.plannedOutCents;
    day.closingCents = balance;
    if (balance < 0 && !firstShortage) firstShortage = { date: day.date, shortfallCents: -balance };
  }
  return { days, firstShortage, maxShortfallCents: firstShortage ? firstShortage.shortfallCents : 0, incompleteInvoiceIds: [], staleExpectationIds: [], overdueExpenseIds: [] };
}

describe("overview answer", () => {
  it("leads with the first gap, not the day-30 balance", () => {
    const answer = overviewAnswer(forecast(), 4_000_000);
    expect(answer.tone).toBe("short");
    expect(answer.headline).toBe("You'll be ₱40,000 short on 7 Nov.");
    expect(answer.eyebrow).toBe("Cash runs short tomorrow");
    expect(answer.shortDate).toBe("2026-11-07");
  });
  it("lists recorded cash, what is due by the gap day, and expected money marked as not received", () => {
    expect(overviewAnswer(forecast(), 4_000_000).facts).toEqual([
      { amount: "₱40,000", text: "cash you've recorded" },
      { amount: "₱80,000", text: "due by 7 Nov" },
      { amount: "₱12,500", text: "expected, not received yet" },
    ]);
  });
  it("says what happens by the end of the 30 days, as a secondary line", () => {
    expect(overviewAnswer(forecast(), 4_000_000).endNote).toBe("Still ₱27,500 short on 5 Dec.");
    expect(overviewAnswer(forecast({ inn: 6_000_000 }), 4_000_000).endNote).toBe("Back above zero by 5 Dec, at ₱20,000.");
  });
  it("words today and later days naturally", () => {
    expect(overviewAnswer(forecast({ start: -100_000, out: 0, inn: 0 }), -100_000)).toMatchObject({ headline: "You're ₱1,000 short today.", eyebrow: "Cash runs short today" });
  });
  it("gives a calm answer when no day goes below zero", () => {
    const answer = overviewAnswer(forecast({ out: 1_000_000 }), 4_000_000);
    expect(answer).toMatchObject({ tone: "clear", headline: "You have enough cash for the next 30 days.", eyebrow: "No shortfall in 30 days", shortDate: null });
    expect(answer.facts[1]).toEqual({ amount: "₱10,000", text: "due in 30 days" });
  });
  it("never shows round-cent noise or a minus sign inside the headline amount", () => {
    expect(overviewAnswer(forecast({ out: 8_000_050 }), 4_000_000).headline).toBe("You'll be ₱40,000.50 short on 7 Nov.");
  });
});

describe("workflow steps", () => {
  it("shows done, waiting and attention states with plain details", () => {
    const steps = workflowSteps({ records: 7, invoices: 4, expenses: 3, reviews: 1, shortDate: "2026-11-07", followups: 2 });
    expect(steps.map((step) => [step.label, step.status, step.detail, step.href])).toEqual([
      ["Add records", "done", "4 invoices, 3 expenses", "/add"],
      ["Review", "attention", "1 waiting", "/imports"],
      ["Forecast", "attention", "Short from 7 Nov", "/forecast"],
      ["Follow up", "attention", "2 open", "/followups"],
    ]);
  });
  it("marks a clear workspace as caught up", () => {
    const steps = workflowSteps({ records: 2, invoices: 1, expenses: 1, reviews: 0, shortDate: null, followups: 0 });
    expect(steps.map((step) => step.detail)).toEqual(["1 invoice, 1 expense", "Nothing to review", "No shortfall in 30 days", "All caught up"]);
    expect(steps.every((step) => step.status === "done")).toBe(true);
  });
  it("guides a brand-new workspace to the first step only", () => {
    const steps = workflowSteps({ records: 0, invoices: 0, expenses: 0, reviews: 0, shortDate: null, followups: 0 });
    expect(steps.map((step) => step.status)).toEqual(["current", "waiting", "waiting", "waiting"]);
    expect(steps[0].detail).toBe("Start here");
    expect(steps[2].detail).toBe("Needs records first");
  });
});
