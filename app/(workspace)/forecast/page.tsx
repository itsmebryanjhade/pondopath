import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "@/components/dashboard-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { CashForecast } from "@/components/cash-forecast";
import { ScenarioPanel } from "@/components/scenario-panel";

export default async function ForecastPage() {
  const workspace = await getWorkspace();
  const forecast = calculateForecast(workspace.forecastInput);
  const end = forecast.days[29];
  const lowest = forecast.days.reduce((minimum, day) => day.closingCents < minimum.closingCents ? day : minimum);
  const metrics = [
    { label: "Expected receipts", value: checkedSum(forecast.days.map((day) => day.expectedInCents)), note: "Next 30 days · not received cash", tone: "green" },
    { label: "Planned expenses", value: checkedSum(forecast.days.map((day) => day.plannedOutCents)), note: "Next 30 days · includes overdue due-now bills", tone: "blue" },
    { label: "Lowest projected balance", value: lowest.closingCents, note: formatPlanDate(lowest.date), tone: "orange" },
  ];
  return <WorkspaceShell workspace={workspace} className="section-page section-forecast forecast-page overview-page" header={
    <header className="section-heading">
      <div><p className="eyebrow">Planning · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Cash forecast</h1><p>Trace the next 30 days to entered receipts and obligations, then compare an unsaved scenario.</p></div>
      <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /><Link className="section-primary" href="#forecast-scenario"><DashboardIcon name="plus" size={17} />Compare a scenario</Link></div>
    </header>
  }>
    <section className="section-feature" aria-label="30-day balance projection">
      <div className="section-feature-copy">
        <span>Projected end balance</span><strong className={`num${end.closingCents < 0 ? " forecast-below-zero" : ""}`}>{formatPHP(end.closingCents)}</strong>
        <p>{formatPlanDate(end.date)} · includes expected payments that have not been verified as received.</p>
        <Link className="forecast-source-link" href="#forecast-checks">Review shortage checks <DashboardIcon name="arrowRight" size={15} /></Link>
      </div>
      <CashForecast forecast={forecast} workspace={workspace} overview chartId="forecast-main" />
    </section>
    <section className="section-metrics" aria-label="Forecast summary">
      {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}><span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className={`num${value < 0 ? " negative" : ""}`}>{formatPHP(value)}</strong><small>{note}</small></article>)}
    </section>
    <section className="section-lower-grid">
      <section className="records-panel" id="forecast-scenario" aria-labelledby="scenario-planning-heading">
        <div className="records-head"><div><h2 id="scenario-planning-heading">Scenario planning</h2><p>Compare a delayed or partial receipt without saving changes</p></div><DashboardIcon name="calendar" size={18} /></div>
        <div className="forecast-scenario-body">{workspace.invoices.some((invoice) => invoice.outstanding_cents > 0)
          ? <ScenarioPanel key={workspace.revision} workspace={workspace} />
          : <p className="empty-state">No unpaid invoices are available for a receipt scenario. <Link href="/invoices">Review customer invoices</Link>.</p>}
        </div>
      </section>
      <aside className="section-ai-card" id="forecast-checks">
        <span><DashboardIcon name="alert" size={15} />Forecast checks</span>
        <h2>First projected shortage</h2>
        <p className="forecast-first-shortage">{forecast.firstShortage ? `${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(forecast.firstShortage.date)}` : "None projected from entered records"}</p>
        <p>Largest projected shortfall: <strong>{formatPHP(forecast.maxShortfallCents)}</strong></p>
        <p>{forecast.incompleteInvoiceIds.length ? `Incomplete plan: ${forecast.incompleteInvoiceIds.length} unpaid invoices have unplanned amounts or no usable expected payment. ` : "This plan reflects entered records only. "}{forecast.staleExpectationIds.length} past expectations excluded; {forecast.overdueExpenseIds.length} overdue expenses treated as due now.</p>
        <Link className="forecast-source-link" href="/invoices">Review inputs <DashboardIcon name="arrowRight" size={15} /></Link>
        <div className="source-note"><span>Zero cash leaves no buffer</span><strong>Expected is not received</strong></div>
      </aside>
    </section>
  </WorkspaceShell>;
}
