import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { expenseLinks, formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "@/components/dashboard-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { CashForecast } from "@/components/cash-forecast";
import { ScenarioPanel } from "@/components/scenario-panel";
import { JumpLink } from "@/components/jump-link";
import { ForecastCheckList } from "@/components/forecast-check-list";
import { AiContextButton } from "@/components/ai-context-button";
import { forecastChecks } from "@/lib/ui/forecast-checks";
import { forecastWeeks } from "@/lib/ui/forecast-weeks";

export default async function ForecastPage() {
  const workspace = await getWorkspace();
  const forecast = calculateForecast(workspace.forecastInput);
  const end = forecast.days[29];
  const checks = forecastChecks(workspace, forecast, "forecast");
  const weeks = forecastWeeks(forecast.days, workspace.forecastInput);
  const expenseHrefs = expenseLinks(workspace.expenses);
  const today = workspace.forecastInput.referenceDate;
  // Who or what each counted record is, where it opens, and a short second line.
  const describe = (item: ReturnType<typeof forecastWeeks>[number]["items"][number]) => {
    if (item.kind === "in") {
      const invoice = workspace.invoices.find((row) => row.id === item.id);
      const customer = workspace.customers.find((row) => row.id === invoice?.customer_id)?.name;
      return { name: invoice?.number ?? "Invoice", detail: customer ? `${customer} · expected` : "Expected payment", href: `/invoices/${item.id}?from=forecast` };
    }
    const bill = workspace.expenses.find((row) => row.id === item.id);
    const late = !!bill && bill.due_date < today;
    return { name: bill?.label ?? "Bill", detail: [bill?.payee, late ? `overdue since ${formatPlanDate(bill!.due_date, true)}` : "due"].filter(Boolean).join(" · "), href: expenseHrefs.get(item.id) ?? "/expenses" };
  };
  // "8–14 Nov", or "29 Nov–5 Dec" when the span crosses a month.
  const span = (first: string, last: string) => first.slice(0, 7) === last.slice(0, 7)
    ? `${formatPlanDate(first, true).split(" ")[0]}–${formatPlanDate(last, true)}`
    : `${formatPlanDate(first, true)}–${formatPlanDate(last, true)}`;

  return <WorkspaceShell workspace={workspace} className="section-page section-forecast forecast-page overview-page" header={
    <header className="section-heading">
      <div><p className="eyebrow">Planning · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Cash forecast</h1><p>See the next 30 days, what causes a shortfall, and what happens if a customer pays later.</p></div>
      <RefreshRecords />
    </header>
  }>
    <section className="section-feature forecast-feature" aria-label="Forecast highlights">
      <div className="section-feature-copy">
        <span>Projected end balance</span><strong className={`num${end.closingCents < 0 ? " forecast-below-zero" : ""}`}>{formatPHP(end.closingCents)}</strong>
        <p>{formatPlanDate(end.date)} · includes expected payments that have not been verified as received.</p>
        <p className="forecast-first-shortfall">{forecast.firstShortage ? <>First shortfall · <strong className="num">{formatPHP(forecast.firstShortage.shortfallCents)} on {formatPlanDate(forecast.firstShortage.date)}</strong></> : "No shortfall in the next 30 days"}</p>
        {forecast.firstShortage && (
          <AiContextButton tone="inverse" entry={{
            context: { page: "forecast" }, workspace,
            starterText: "Explain our first cash shortage",
          }}>Explain this cash gap</AiContextButton>
        )}
        <JumpLink className="forecast-source-link" target="forecast-checks">{checks.length ? `${checks.length} ${checks.length === 1 ? "thing" : "things"} to check` : "Forecast checks"} <DashboardIcon name="arrowRight" size={15} /></JumpLink>
      </div>
      <CashForecast forecast={forecast} workspace={workspace} overview chartId="forecast-main" origin="forecast" />
    </section>
    <section className="forecast-weeks records-panel" aria-labelledby="forecast-weeks-heading">
      <div className="records-head"><div><h2 id="forecast-weeks-heading">Cash by week</h2><p>The invoices and bills behind each week. Money in is expected, not received yet.</p></div></div>
      <ol className="forecast-week-list" role="list">
        {weeks.map((week) => {
          const when = span(week.firstDate, week.lastDate);
          if (week.quiet) return <li key={week.firstDate} className="forecast-week-row is-quiet">
            <h3>{when}</h3><p>Nothing comes in or goes out.</p>
          </li>;
          const shown = week.items.slice(0, 6);
          return <li key={week.firstDate} className="forecast-week-row">
            <div className="forecast-week-when">
              <h3>{when}</h3>
              <p>
                {week.inCents > 0 && <span className="is-in num">+{formatPHP(week.inCents)} in</span>}
                {week.outCents > 0 && <span className="is-out num">−{formatPHP(week.outCents)} out</span>}
              </p>
            </div>
            <ul className="forecast-week-items">
              {shown.map((item) => {
                const record = describe(item);
                return <li key={`${item.kind}-${item.id}-${item.date}`} className={`is-${item.kind}`}>
                  <Link href={record.href}>
                    <time dateTime={item.date}>{formatPlanDate(item.date, true)}</time>
                    <span className="forecast-week-item-name"><strong>{record.name}</strong><small>{record.detail}</small></span>
                    <strong className="num">{item.kind === "in" ? "+" : "−"}{formatPHP(item.cents)}</strong>
                  </Link>
                </li>;
              })}
              {week.items.length > shown.length && <li className="forecast-week-more">+{week.items.length - shown.length} more in the daily cash plan</li>}
            </ul>
          </li>;
        })}
      </ol>
    </section>
    <section className="section-lower-grid forecast-bento">
      <section className="records-panel" id="forecast-scenario" aria-labelledby="scenario-planning-heading">
        <div className="records-head"><div><h2 id="scenario-planning-heading">What if a customer pays later or only part?</h2><p>Try a payment date or amount. Nothing is saved.</p></div><span className="planning-chip">Preview only</span></div>
        <div className="forecast-scenario-body">{workspace.invoices.some((invoice) => invoice.outstanding_cents > 0)
          ? <ScenarioPanel key={workspace.revision} workspace={workspace} inline />
          : <p className="empty-state">No unpaid invoices to try. <Link href="/add">Add an invoice</Link> first.</p>}
        </div>
      </section>
      <aside className={`forecast-checks-card ${checks.length ? "is-caution" : "is-clear"}`} id="forecast-checks" aria-labelledby="forecast-checks-heading">
        <div className="checks-card-head">
          <span className="checks-eyebrow"><DashboardIcon name={checks.length ? "alert" : "check"} size={15} />{checks.length ? "Check first" : "All clear"}</span>
          <h2 id="forecast-checks-heading">Before you trust this forecast</h2>
          <p>{checks.length ? `${checks.length} ${checks.length === 1 ? "thing" : "things"} could make it wrong` : "Nothing here could make it wrong"}</p>
        </div>
        <div className="forecast-checks-body"><ForecastCheckList checks={checks} /></div>
      </aside>
    </section>
  </WorkspaceShell>;
}
