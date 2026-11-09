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
import { JumpLink } from "@/components/jump-link";
import { ForecastCheckList } from "@/components/forecast-check-list";
import { AiContextButton } from "@/components/ai-context-button";
import { forecastChecks } from "@/lib/ui/forecast-checks";

export default async function ForecastPage() {
  const workspace = await getWorkspace();
  const forecast = calculateForecast(workspace.forecastInput);
  const end = forecast.days[29];
  const lowest = forecast.days.reduce((minimum, day) => day.closingCents < minimum.closingCents ? day : minimum);
  const checks = forecastChecks(workspace, forecast, "forecast");
  const metrics = [
    { label: "Expected receipts", value: checkedSum(forecast.days.map((day) => day.expectedInCents)), note: "Next 30 days · not received cash", tone: "green" },
    { label: "Planned expenses", value: checkedSum(forecast.days.map((day) => day.plannedOutCents)), note: "Next 30 days · includes overdue due-now bills", tone: "blue" },
    { label: "Lowest projected balance", value: lowest.closingCents, note: formatPlanDate(lowest.date), tone: "orange" },
  ];
  return <WorkspaceShell workspace={workspace} className="section-page section-forecast forecast-page overview-page" header={
    <header className="section-heading">
      <div><p className="eyebrow">Planning · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Cash forecast</h1><p>See the next 30 days, what causes a shortfall, and what happens if a customer pays later.</p></div>
      <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /></div>
    </header>
  }>
    <section className="section-feature" aria-label="30-day balance projection">
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
      <CashForecast forecast={forecast} workspace={workspace} overview chartId="forecast-main" />
    </section>
    <section className="section-metrics" aria-label="Forecast summary">
      {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}><span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className={`num${value < 0 ? " negative" : ""}`}>{formatPHP(value)}</strong><small>{note}</small></article>)}
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
