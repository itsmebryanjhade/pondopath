import { describe, expect, it } from "vitest";
import { calculateForecast } from "@/lib/domain/forecast";
import type { ForecastInput } from "@/lib/domain/types";
import { forecastWeeks } from "@/lib/ui/forecast-weeks";

const input = (invoices: ForecastInput["invoices"], expenses: ForecastInput["expenses"]): ForecastInput =>
  ({ referenceDate: "2026-11-08", availableCents: 5_000_000, invoices, expenses });
const invoice = (id: string, date: string, cents: number): ForecastInput["invoices"][number] =>
  ({ id, outstandingCents: cents, expectation: { id: `e-${id}`, date, remainingCents: cents, kind: "commitment", needsReview: false } });

describe("forecast weeks", () => {
  it("lists the records behind each busy week and merges quiet weeks into one row", () => {
    const plan = input([invoice("inv-1", "2026-11-12", 2_000_050)], [{ id: "bill-1", dueDate: "2026-11-08", unpaidCents: 8_000_000 }]);
    const weeks = forecastWeeks(calculateForecast(plan).days, plan);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ firstDate: "2026-11-08", lastDate: "2026-11-14", quiet: false, inCents: 2_000_050, outCents: 8_000_000 });
    expect(weeks[0].items).toEqual([
      { kind: "out", id: "bill-1", date: "2026-11-08", cents: 8_000_000 },
      { kind: "in", id: "inv-1", date: "2026-11-12", cents: 2_000_050 },
    ]);
    expect(weeks[1]).toMatchObject({ firstDate: "2026-11-15", lastDate: "2026-12-07", quiet: true, items: [] });
  });

  it("keeps a busy week between quiet ones and counts an overdue bill on the first day, as the forecast does", () => {
    const plan = input([invoice("inv-1", "2026-12-02", 100_000)], [{ id: "late", dueDate: "2026-11-01", unpaidCents: 50_000 }, { id: "mid", dueDate: "2026-11-18", unpaidCents: 70_000 }]);
    const weeks = forecastWeeks(calculateForecast(plan).days, plan);
    expect(weeks.map((week) => [week.firstDate, week.quiet])).toEqual([
      ["2026-11-08", false], ["2026-11-15", false], ["2026-11-22", true], ["2026-11-29", false], ["2026-12-06", true],
    ]);
    expect(weeks[0].items).toEqual([{ kind: "out", id: "late", date: "2026-11-08", cents: 50_000 }]);
    // Each row's item amounts add up to that row's totals.
    for (const week of weeks) {
      expect(week.items.filter((item) => item.kind === "in").reduce((sum, item) => sum + item.cents, 0)).toBe(week.inCents);
      expect(week.items.filter((item) => item.kind === "out").reduce((sum, item) => sum + item.cents, 0)).toBe(week.outCents);
    }
  });
});
