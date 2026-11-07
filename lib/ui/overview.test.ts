import { describe, expect, it } from "vitest";
import { workflowSteps } from "./overview";

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
