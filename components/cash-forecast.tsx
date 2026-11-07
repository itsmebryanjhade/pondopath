import Link from "next/link";
import { formatPHP } from "@/lib/domain/money";
import type { ForecastResult } from "@/lib/domain/types";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { expenseLinks, formatPlanDate } from "@/lib/display";

export function CashForecast({
  forecast,
  workspace,
  overview = false,
  chartId = "overview",
}: {
  forecast: ForecastResult;
  workspace: WorkspaceSnapshot;
  overview?: boolean;
  chartId?: string;
}) {
  const balances = forecast.days.map((day) => day.closingCents);
  const low = Math.min(0, ...balances);
  const high = Math.max(0, ...balances);
  const rawStep = (high - low || 100_000) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 5, 10].find((number) => number * power >= rawStep) ?? 10) * power;
  const min = Math.floor(low / step) * step - step;
  const max = Math.ceil(high / step) * step + step;
  const x = (index: number) => overview ? (index * 700) / 29 : 82 + (index * 506) / 29;
  const y = (value: number) => 20 + ((max - value) / (max - min)) * (overview ? 174 : 150);
  const points = forecast.days.map((day, index) => `${x(index)},${y(day.closingCents)}`).join(" ");
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, index) => min + index * step,
  );
  const end = forecast.days[29];
  const expenseHrefs = expenseLinks(workspace.expenses);
  const shortageIndex = forecast.firstShortage ? forecast.days.findIndex((day) => day.date === forecast.firstShortage!.date) : -1;
  const dailyPlan = (
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
  );
  if (overview) {
    const line = forecast.days.map((day, index) => `${index ? "L" : "M"}${x(index)},${y(day.closingCents)}`).join(" ");
    const pointDays = [...new Set([0, 7, 14, 21, 29, shortageIndex].filter((index) => index >= 0))].sort((a, b) => a - b);
    return <section className="forecast overview-forecast" aria-labelledby={`${chartId}-forecast-heading`}>
      <div className="forecast-head">
        <div><h2 id={`${chartId}-forecast-heading`}>30-day cash forecast</h2><p>{formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(end.date)} · PHP</p></div>
        <div className="period-control" aria-label="Forecast window"><span className="active">30d</span></div>
      </div>
      <div className="chart-wrap">
        <div className="chart-labels" aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ top: `${(y(tick) / 230) * 100}%` }}>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(tick / 100)}</span>)}</div>
        <svg className="chart" viewBox="0 0 700 230" preserveAspectRatio="none" role="img" aria-labelledby={`${chartId}-chart-title ${chartId}-chart-description`}>
          <title id={`${chartId}-chart-title`}>Projected closing cash over 30 days</title>
          <desc id={`${chartId}-chart-description`}>{forecast.firstShortage ? `First projected shortage ${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(forecast.firstShortage.date)}.` : "No shortage projected from entered records."} The daily cash plan below provides every amount and source record.</desc>
          <defs><linearGradient id={`${chartId}-chart-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#45a874" stopOpacity=".25" /><stop offset="100%" stopColor="#45a874" stopOpacity=".01" /></linearGradient></defs>
          <g className="grid-lines">{ticks.map((tick) => <line key={tick} x1="0" x2="700" y1={y(tick)} y2={y(tick)} />)}</g>
          <line className="chart-zero" x1="0" x2="700" y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
          <path className="area" style={{ fill: `url(#${chartId}-chart-fill)` }} d={`${line} L700,${y(0)} L0,${y(0)} Z`} />
          <path className="line" d={line} pathLength="1200" />
          {shortageIndex >= 0 && <line className="risk-line" x1={x(shortageIndex)} x2={x(shortageIndex)} y1="20" y2="220" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="forecast-points" aria-label="Forecast data points">
          {pointDays.map((index) => {
            const label = `${formatPlanDate(forecast.days[index].date)} · ${formatPHP(forecast.days[index].closingCents)}`;
            return <button key={index} type="button" className={`${index === shortageIndex ? "point-4 " : ""}${index <= 4 ? "point-1" : index >= 25 ? "point-5" : ""}`} style={{ left: `${(index / 29) * 100}%`, top: `${(y(forecast.days[index].closingCents) / 230) * 100}%` }} aria-label={label} data-tooltip={label} />;
          })}
          {shortageIndex >= 0 && <div className="risk-tip" style={{ left: `${Math.min(85, Math.max(15, (shortageIndex / 29) * 100))}%`, top: `${Math.min(70, Math.max(15, (y(forecast.days[shortageIndex].closingCents) / 230) * 100 - 25))}%` }}><span>{formatPlanDate(forecast.days[shortageIndex].date, true)}</span><strong>{formatPHP(forecast.days[shortageIndex].closingCents)}</strong></div>}
        </div>
        <div className="chart-dates" aria-hidden="true">{[0, 7, 14, 21, 29].map((index) => <span key={index}>{formatPlanDate(forecast.days[index].date, true)}</span>)}</div>
      </div>
      <div className="chart-legend"><span><i className="legend-line" />Projected balance</span>{shortageIndex >= 0 && <span><i className="legend-dot" />Potential shortfall</span>}<span className="forecast-source">Based on recorded invoices and bills</span></div>
      {dailyPlan}
    </section>;
  }
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
        {/* Scale the plot separately so a wider monitor does not stretch axis text. */}
        <svg viewBox="0 0 620 210" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
        {ticks.map((tick) => <line key={tick} x1="82" x2="588" y1={y(tick)} y2={y(tick)} className="chart-grid" />)}
        <line x1="82" x2="588" y1={y(0)} y2={y(0)} className="chart-zero" />
        <polygon points={`${x(0)},${y(0)} ${points} ${x(29)},${y(0)}`} className="chart-area" />
        <polyline
          points={points}
          fill="none"
          className="chart-forecast"
          strokeWidth="2"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
        </svg>
        {ticks.map((tick) => (
          <text key={tick} x={`${(73 / 620) * 100}%`} y={`${(y(tick) / 210) * 100}%`} dy="4" textAnchor="end">
            {(tick / 100).toLocaleString("en-PH", {
              notation: Math.abs(tick) >= 100_000_000 ? "compact" : "standard",
              maximumFractionDigits: max - min < 10_000 ? 2 : 0,
            })}
          </text>
        ))}
        {shortageIndex >= 0 && (
          <circle cx={`${(x(shortageIndex) / 620) * 100}%`} cy={`${(y(forecast.days[shortageIndex].closingCents) / 210) * 100}%`} r="3.5" className="chart-shortage">
            <title>{`${formatPlanDate(forecast.days[shortageIndex].date)}: ${formatPHP(forecast.days[shortageIndex].closingCents)}`}</title>
          </circle>
        )}
        {[0, 7, 14, 21, 28].map((index) => (
          <text
            key={index}
            x={`${(x(index) / 620) * 100}%`}
            y={`${(199 / 210) * 100}%`}
            textAnchor={index === 0 ? "start" : index === 28 ? "end" : "middle"}
          >
            {formatPlanDate(forecast.days[index].date, true)}
          </text>
        ))}
      </svg>
      </div>
      <p className="chart-scroll-hint muted">Scroll the chart horizontally to see the whole period.</p>
      <p className="forecast-caption muted">Dashed line: calculated plan. Expected payments are planning assumptions.</p>
      {dailyPlan}
    </section>
  );
}
