import { checkedSum, formatPHP } from "@/lib/domain/money";
import type { ForecastResult } from "@/lib/domain/types";
import { formatPlanDate } from "@/lib/display";

/** Amounts inside sentences: no minus sign and no ".00", but real centavos stay. */
const peso = (cents: number) => formatPHP(Math.abs(cents)).replace(/\.00$/, "");
const day = (date: string) => formatPlanDate(date, true);

export type OverviewAnswer = {
  tone: "short" | "clear";
  eyebrow: string;
  headline: string;
  facts: { amount: string; text: string }[];
  endNote: string;
  shortDate: string | null;
};

/** The Overview's answer: the first day cash runs short comes first; the day-30 balance is secondary. */
export function overviewAnswer(forecast: ForecastResult, availableCents: number): OverviewAnswer {
  const shortage = forecast.firstShortage;
  const end = forecast.days[forecast.days.length - 1];
  const expected = checkedSum(forecast.days.map((item) => item.expectedInCents));
  const recorded = { amount: peso(availableCents), text: "cash you've recorded" };
  const expectedFact = { amount: peso(expected), text: "expected, not received yet" };
  if (!shortage) {
    const due = checkedSum(forecast.days.map((item) => item.plannedOutCents));
    return {
      tone: "clear", eyebrow: "No shortfall in 30 days", headline: "You have enough cash for the next 30 days.",
      facts: [recorded, { amount: peso(due), text: "due in 30 days" }, expectedFact],
      endNote: `About ${peso(end.closingCents)} left on ${day(end.date)}.`, shortDate: null,
    };
  }
  const index = forecast.days.findIndex((item) => item.date === shortage.date);
  const dueBy = checkedSum(forecast.days.slice(0, index + 1).map((item) => item.plannedOutCents));
  const eyebrow = index === 0 ? "Cash runs short today" : index === 1 ? "Cash runs short tomorrow" : `Cash runs short in ${index} days`;
  const headline = index === 0 ? `You're ${peso(shortage.shortfallCents)} short today.` : `You'll be ${peso(shortage.shortfallCents)} short on ${day(shortage.date)}.`;
  const endNote = end.closingCents < 0 ? `Still ${peso(end.closingCents)} short on ${day(end.date)}.` : `Back above zero by ${day(end.date)}, at ${peso(end.closingCents)}.`;
  return { tone: "short", eyebrow, headline, facts: [recorded, { amount: peso(dueBy), text: `due by ${day(shortage.date)}` }, expectedFact], endNote, shortDate: shortage.date };
}

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
