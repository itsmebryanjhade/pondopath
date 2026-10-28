import Link from "next/link";
import { formatPHP } from "@/lib/domain/money";
import type { ForecastResult } from "@/lib/domain/types";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { expenseLinks, formatPlanDate } from "@/lib/display";

export function CashForecast({
  forecast,
  workspace,
}: {
  forecast: ForecastResult;
  workspace: WorkspaceSnapshot;
}) {
  const balances = forecast.days.map((day) => day.closingCents);
  const low = Math.min(0, ...balances);
  const high = Math.max(0, ...balances);
  const rawStep = (high - low || 100_000) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 5, 10].find((number) => number * power >= rawStep) ?? 10) * power;
  const min = Math.floor(low / step) * step - step;
  const max = Math.ceil(high / step) * step + step;
  const x = (index: number) => 82 + (index * 506) / 29;
  const y = (value: number) => 20 + ((max - value) / (max - min)) * 150;
  const points = forecast.days.map((day, index) => `${x(index)},${y(day.closingCents)}`).join(" ");
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, index) => min + index * step,
  );
  const end = forecast.days[29];
  const expenseHrefs = expenseLinks(workspace.expenses);
  const shortageIndex = forecast.firstShortage ? forecast.days.findIndex((day) => day.date === forecast.firstShortage!.date) : -1;
  return (
    <section className="panel forecast-panel" aria-labelledby="forecast-heading">
      <div className="forecast-top">
        <h2 id="forecast-heading">30-day cash forecast</h2>
        <p className="muted">{formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(end.date)} · PHP</p>
      </div>
      <div className={`forecast-end${end.closingCents < 0 ? " is-negative" : ""}`}>
        <span>Projected end balance</span><strong className="num">{formatPHP(end.closingCents)}</strong><span>{formatPlanDate(end.date)}</span>
      </div>
      <div className="chart-scroll" tabIndex={0} role="region" aria-label="Projected closing cash chart">
      <svg
        viewBox="0 0 620 210"
        className="cash-chart"
        role="img"
        aria-labelledby="forecast-chart-title forecast-chart-description"
      >
        <title id="forecast-chart-title">Projected closing cash over 30 days</title>
        <desc id="forecast-chart-description">
          {forecast.firstShortage
            ? `First projected shortage ${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(forecast.firstShortage.date)}.`
            : "No shortage projected from entered records."}{" "}
          The daily cash plan below provides every amount and its source records.
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1="82" x2="588" y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x="73" y={y(tick) + 4} textAnchor="end">
              {(tick / 100).toLocaleString("en-PH", {
                notation: Math.abs(tick) >= 100_000_000 ? "compact" : "standard",
                maximumFractionDigits: max - min < 10_000 ? 2 : 0,
              })}
            </text>
          </g>
        ))}
        <line x1="82" x2="588" y1={y(0)} y2={y(0)} className="chart-zero" />
        <polygon points={`${x(0)},${y(0)} ${points} ${x(29)},${y(0)}`} className="chart-area" />
        <polyline
          points={points}
          fill="none"
          className="chart-forecast"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        {shortageIndex >= 0 && (
          <circle cx={x(shortageIndex)} cy={y(forecast.days[shortageIndex].closingCents)} r="3.5" className="chart-shortage">
            <title>{formatPlanDate(forecast.days[shortageIndex].date)}: {formatPHP(forecast.days[shortageIndex].closingCents)}</title>
          </circle>
        )}
        {[0, 7, 14, 21, 28].map((index) => (
          <text
            key={index}
            x={x(index)}
            y="199"
            textAnchor={index === 0 ? "start" : index === 28 ? "end" : "middle"}
          >
            {formatPlanDate(forecast.days[index].date, true)}
          </text>
        ))}
      </svg>
      </div>
      <p className="chart-scroll-hint muted">Scroll the chart horizontally to see the whole period.</p>
      <p className="forecast-caption muted">Dashed line: calculated plan. Expected payments are planning assumptions.</p>
      <details className="daily-plan">
        <summary>View daily cash plan</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Daily cash forecast">
          <table>
            <caption className="sr-only">Daily projected cash and contributing records</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Expected in
                </th>
                <th scope="col" className="num">
                  Planned out
                </th>
                <th scope="col" className="num">
                  Closing cash
                </th>
                <th scope="col">Source records</th>
              </tr>
            </thead>
            <tbody>
              {forecast.days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatPlanDate(day.date)}</th>
                  <td className="num">{formatPHP(day.expectedInCents)}</td>
                  <td className="num">{formatPHP(day.plannedOutCents)}</td>
                  <td className={`num ${day.closingCents < 0 ? "negative" : ""}`}>
                    {formatPHP(day.closingCents)}
                  </td>
                  <td>
                    {day.invoiceIds.map((id) => (
                      <Link className="source-link" href={`/invoices/${id}`} key={id}>
                        {workspace.invoices.find((row) => row.id === id)?.number}
                      </Link>
                    ))}
                    {day.expenseIds.map((id) => (
                      <Link className="source-link" href={expenseHrefs.get(id) ?? "/expenses"} key={id}>
                        {workspace.expenses.find((row) => row.id === id)?.label}
                      </Link>
                    ))}
                    {day.invoiceIds.length + day.expenseIds.length === 0 && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
