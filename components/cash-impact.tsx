import { formatPHP } from "@/lib/domain/money";
import type { ForecastResult } from "@/lib/domain/types";

export function CashImpact({
  baseline,
  scenario,
}: {
  baseline: ForecastResult;
  scenario: ForecastResult;
}) {
  const gapDate = scenario.firstShortage?.date ?? baseline.firstShortage?.date;
  const previewClosing = scenario.days.find((day) => day.date === gapDate)?.closingCents ?? 0;
  return (
    <div className="cash-impact">
      <h3>Cash impact · Unsaved preview</h3>
      <div className="table-scroll" role="region" aria-label="Cash impact comparison" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="num">
                Current plan
              </th>
              <th scope="col" className="num">
                Preview
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">First shortage</th>
              <td className="num">{baseline.firstShortage?.date ?? "None projected"}</td>
              <td className="num">{scenario.firstShortage?.date ?? "None projected"}</td>
            </tr>
            <tr>
              <th scope="row">First shortfall amount</th>
              <td className="num">{formatPHP(baseline.firstShortage?.shortfallCents ?? 0)}</td>
              <td className="num">{formatPHP(scenario.firstShortage?.shortfallCents ?? 0)}</td>
            </tr>
            {gapDate && (
              <tr>
                <th scope="row">Closing cash on {gapDate}</th>
                <td className="num">
                  {formatPHP(baseline.days.find((day) => day.date === gapDate)!.closingCents)}
                </td>
                <td className={`num${previewClosing < 0 ? " negative" : ""}`}>
                  {formatPHP(previewClosing)}
                </td>
              </tr>
            )}
            <tr>
              <th scope="row">Largest shortfall</th>
              <td className="num">{formatPHP(baseline.maxShortfallCents)}</td>
              <td className="num">{formatPHP(scenario.maxShortfallCents)}</td>
            </tr>
            <tr>
              <th scope="row">Ending cash · {baseline.days.at(-1)!.date}</th>
              <td className="num">{formatPHP(baseline.days.at(-1)!.closingCents)}</td>
              <td className="num">{formatPHP(scenario.days.at(-1)!.closingCents)}</td>
            </tr>
            <tr>
              <th scope="row">Invoices with unplanned amounts</th>
              <td className="num">{baseline.incompleteInvoiceIds.length}</td>
              <td className="num">{scenario.incompleteInvoiceIds.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        This preview changes no records or actual cash. Future receipts remain uncertain.
      </p>
    </div>
  );
}
