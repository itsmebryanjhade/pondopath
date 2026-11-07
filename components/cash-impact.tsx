import { formatPHP } from "@/lib/domain/money";
import type { ForecastResult } from "@/lib/domain/types";
import { formatPlanDate } from "@/lib/display";

const day = (date: string) => formatPlanDate(date, true);
const same = (a: ForecastResult, b: ForecastResult) => a.days.every((item, index) => item.closingCents === b.days[index].closingCents);

/** The answer in one sentence: what this payment does to the first shortfall. */
export function impactSummary(baseline: ForecastResult, scenario: ForecastResult): { tone: "better" | "worse" | "same"; text: string } {
  if (same(baseline, scenario)) return { tone: "same", text: "This matches your current plan. Change the date or amount to see the difference." };
  const before = baseline.firstShortage, after = scenario.firstShortage;
  if (before && !after) return { tone: "better", text: `You'd have enough cash for all 30 days.` };
  if (!before && after) return { tone: "worse", text: `You'd run ${formatPHP(after.shortfallCents)} short on ${day(after.date)}.` };
  if (!before || !after) return { tone: scenario.days.at(-1)!.closingCents >= baseline.days.at(-1)!.closingCents ? "better" : "worse", text: "Still no shortfall in the next 30 days." };
  if (after.date !== before.date) return { tone: after.date > before.date ? "better" : "worse", text: `The shortfall moves from ${day(before.date)} to ${day(after.date)}.` };
  const diff = after.shortfallCents - before.shortfallCents;
  if (diff === 0) return { tone: "same", text: `Still ${formatPHP(after.shortfallCents)} short on ${day(after.date)}.` };
  return { tone: diff < 0 ? "better" : "worse", text: `Still short on ${day(after.date)}, by ${formatPHP(after.shortfallCents)} instead of ${formatPHP(before.shortfallCents)}.` };
}

function Change({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  if (!diff) return <span className="impact-change">No change</span>;
  return <span className={`impact-change ${diff > 0 ? "up" : "down"}`}>{diff > 0 ? "+" : "−"}{formatPHP(Math.abs(diff))}</span>;
}

/** Before-and-after for an unsaved scenario: the shortfall, cash on the gap day and cash at day 30. */
export function CashImpact({ baseline, scenario }: { baseline: ForecastResult; scenario: ForecastResult }) {
  const summary = impactSummary(baseline, scenario);
  const shortfall = (result: ForecastResult) => result.firstShortage ? `${formatPHP(result.firstShortage.shortfallCents)} short on ${day(result.firstShortage.date)}` : "None";
  const gapDate = baseline.firstShortage?.date ?? scenario.firstShortage?.date;
  const cashOn = (result: ForecastResult, date: string) => result.days.find((item) => item.date === date)!.closingCents;
  const endDate = baseline.days.at(-1)!.date;
  const rows = [
    ...(gapDate ? [{ label: `Cash on ${day(gapDate)}`, before: cashOn(baseline, gapDate), after: cashOn(scenario, gapDate) }] : []),
    { label: `Cash on ${day(endDate)} (day 30)`, before: cashOn(baseline, endDate), after: cashOn(scenario, endDate) },
  ];
  return (
    <div className="cash-impact" aria-live="polite">
      <p className={`impact-summary is-${summary.tone}`}>{summary.text}</p>
      <dl className="impact-rows">
        <div className="impact-row impact-head" aria-hidden="true"><span /><span>Now</span><span>With this payment</span><span /></div>
        <div className="impact-row">
          <dt>First shortfall</dt>
          <dd className="num">{shortfall(baseline)}</dd>
          <dd className={`num${scenario.firstShortage ? " negative" : " positive"}`}><span className="sr-only">With this payment: </span>{shortfall(scenario)}</dd>
          <dd />
        </div>
        {rows.map((row) => <div className="impact-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd className={`num${row.before < 0 ? " negative" : ""}`}>{formatPHP(row.before)}</dd>
          <dd className={`num${row.after < 0 ? " negative" : ""}`}><span className="sr-only">With this payment: </span>{formatPHP(row.after)}</dd>
          <dd><Change before={row.before} after={row.after} /></dd>
        </div>)}
      </dl>
    </div>
  );
}
