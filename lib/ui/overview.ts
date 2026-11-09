import { formatPlanDate } from "@/lib/display";

const day = (date: string) => formatPlanDate(date, true);

export type WorkflowStep = { label: string; status: "done" | "attention" | "current" | "waiting"; detail: string; href: string };

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The four-step workflow shown at the top of the Overview: Add records, Review, Forecast, Follow up. */
export function workflowSteps(input: { records: number; invoices: number; expenses: number; reviews: number; shortDate: string | null; followups: number }): WorkflowStep[] {
  if (!input.records) {
    return [
      { label: "Add records", status: "current", detail: "Start here", href: "/add" },
      { label: "Review", status: "waiting", detail: input.reviews ? `${input.reviews} waiting` : "After you add records", href: "/imports" },
      { label: "Forecast", status: "waiting", detail: "Needs records first", href: "/forecast" },
      { label: "Follow up", status: "waiting", detail: "Needs records first", href: "/followups" },
    ];
  }
  return [
    { label: "Add records", status: "done", detail: `${count(input.invoices, "invoice")}, ${count(input.expenses, "expense")}`, href: "/add" },
    { label: "Review", status: input.reviews ? "attention" : "done", detail: input.reviews ? `${input.reviews} waiting` : "Nothing to review", href: "/imports" },
    { label: "Forecast", status: input.shortDate ? "attention" : "done", detail: input.shortDate ? `Short from ${day(input.shortDate)}` : "No shortfall in 30 days", href: "/forecast" },
    { label: "Follow up", status: input.followups ? "attention" : "done", detail: input.followups ? `${input.followups} open` : "All caught up", href: "/followups" },
  ];
}
