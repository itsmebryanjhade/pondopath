import Link from "next/link";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { buildActivityRows, invoiceList } from "@/lib/ui/cash-overview";
import { CashForecast } from "./cash-forecast";
import { CashActivity } from "./cash-activity";
import { NextActions } from "./next-actions";
import { WorkspaceShell } from "./workspace-shell";
import { RefreshRecords } from "./refresh-records";
import { DashboardIcon } from "./dashboard-icon";
import { AppIcon } from "./app-icon";
import { workflowSteps } from "@/lib/ui/overview";
import { forecastChecks } from "@/lib/ui/forecast-checks";
import { ForecastCheckList } from "./forecast-check-list";
import { JumpLink } from "./jump-link";
import { AiContextButton } from "./ai-context-button";

const STEP_MARK = { done: "Done", attention: "Needs you", current: "Next", waiting: "Later" } as const;

export function CashOverview({ workspace }: { workspace: WorkspaceSnapshot }) {
  const forecast = calculateForecast(workspace.forecastInput);
  const rows = buildActivityRows(workspace);
  const end = forecast.days[29];
  const shortage = forecast.firstShortage;
  const overdue = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0 && invoice.due_date < workspace.forecastInput.referenceDate);
  const steps = workflowSteps({
    records: workspace.invoices.length + workspace.expenses.length, invoices: workspace.invoices.length, expenses: workspace.expenses.length,
    reviews: workspace.intakeReviews?.length ?? 0, shortDate: shortage?.date ?? null, followups: workspace.followups.filter((task) => task.state === "open").length,
  });
  const checks = forecastChecks(workspace, forecast);
  const member = workspace.members.find((row) => row.user_id === workspace.actor.userId);
  const firstName = member?.display_name?.trim().split(/\s+/)[0];
  // The 30-day number, taken apart: cash now + coming in − going out = closing balance (the same sums the forecast uses).
  const coming = checkedSum(forecast.days.map((day) => day.expectedInCents));
  const going = checkedSum(forecast.days.map((day) => day.plannedOutCents));
  const overdueCents = checkedSum(overdue.map((invoice) => invoice.outstanding_cents));
  const parts = [
    { key: "now", label: "Cash now", amount: workspace.forecastInput.availableCents, note: "Recorded in your accounts", href: "/cash", icon: "wallet" },
    { key: "in", label: "Coming in", amount: coming, note: "Expected, not received yet", href: "/invoices", icon: "arrowIn", sign: "+" },
    { key: "out", label: "Going out", amount: going, note: "Bills due, including overdue", href: "/expenses", icon: "arrowOut", sign: "−" },
  ] as const;
  return <WorkspaceShell workspace={workspace} className="overview-page" header={
    <header className="dashboard-heading page-heading">
      <div><p className="dashboard-eyebrow">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name} · Asia/Manila</p><h1>{firstName ? `Your cash overview, ${firstName}` : "Your cash overview"}</h1><p>Here’s what needs your attention to keep cash moving.</p></div>
      <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /></div>
    </header>
  }>
    <nav className="workflow-bar" aria-label="Your cash workflow">
      <ol>{steps.map((step, index) => <li key={step.label} className={`workflow-step is-${step.status}`}>
        <Link href={step.href}>
          <span className="workflow-index" aria-hidden="true">{step.status === "done" ? <DashboardIcon name="check" size={14} /> : index + 1}</span>
          <span className="workflow-copy"><strong>{step.label}</strong><span>{step.detail}</span></span>
          <span className="sr-only">: {STEP_MARK[step.status]}</span>
        </Link>
      </li>)}</ol>
    </nav>
    <div id="cash-forecast" className="overview-hero hero-panel">
      <section className="hero-summary" aria-labelledby="outlook-heading">
        <div className="ai-label"><DashboardIcon name="sparkle" size={15} />Cash-flow outlook</div>
        <p id="outlook-heading" className="hero-kicker">Projected cash in 30 days</p>
        <div className={`hero-value num${end.closingCents < 0 ? " below-zero" : ""}`}>{formatPHP(end.closingCents)}</div>
        <p className="hero-copy">On {formatPlanDate(end.date)}. Includes expected payments that have not been verified as received.</p>
        <div className={`shortfall${shortage ? "" : " is-clear"}`}>
          <span className="shortfall-icon"><DashboardIcon name={shortage ? "alert" : "calendar"} size={17} /></span>
          <div><span>{shortage ? "Earliest projected shortfall" : "No projected shortage"}</span><strong className="num">{shortage ? `${formatPlanDate(shortage.date, true)} · ${formatPHP(shortage.shortfallCents)} gap` : "Based on entered records"}</strong></div>
          <JumpLink target="forecast-review" label="Review cash forecast details"><DashboardIcon name="arrowRight" /></JumpLink>
        </div>
        <div className="overview-hero-ai">
          <AiContextButton tone="inverse" entry={{
            context: { page: "overview" },
            workspace,
            starterText: shortage ? "Explain our first cash shortage" : "How much cash will we have in 30 days?",
          }}>{shortage ? "Explain this gap" : "Explain outlook"}</AiContextButton>
        </div>
        {shortage && <Link className="hero-scenario" href="/forecast#forecast-scenario">Try a later payment date<DashboardIcon name="arrowRight" size={14} /></Link>}
        {forecast.incompleteInvoiceIds.length > 0 && <p className="hero-incomplete">Incomplete plan: {forecast.incompleteInvoiceIds.length} unpaid {forecast.incompleteInvoiceIds.length === 1 ? "invoice has" : "invoices have"} unplanned amounts or no usable expected payment. <Link href="/invoices">Review invoices</Link>.</p>}
        {!shortage && <p className="hero-caution">Missing or unconfirmed records can still change the result.</p>}
      </section>
      <CashForecast forecast={forecast} workspace={workspace} overview origin="overview" />
    </div>
    <section className="cash-sum" aria-labelledby="cash-sum-heading">
      <h2 id="cash-sum-heading" className="sr-only">How the next 30 days add up</h2>
      <ol className="cash-sum-row">
        {parts.map((part) => <li key={part.key} className={`cash-sum-part is-${part.key}`}>
          {"sign" in part && <span className="cash-sum-op" aria-hidden="true">{part.sign}</span>}
          <Link href={part.href}>
            <span className="cash-sum-label"><DashboardIcon name={part.icon} size={15} />{part.label}</span>
            <strong className="num">{"sign" in part && <span className="sr-only">{part.key === "in" ? "plus " : "minus "}</span>}{formatPHP(part.amount)}</strong>
            <small>{part.note}</small>
          </Link>
        </li>)}
        <li className={`cash-sum-part is-result${end.closingCents < 0 ? " is-negative" : ""}`}>
          <span className="cash-sum-op" aria-hidden="true">=</span>
          <JumpLink target="cash-forecast">
            <span className="cash-sum-label">In 30 days</span>
            <strong className="num"><span className="sr-only">equals </span>{formatPHP(end.closingCents)}</strong>
            <small>{end.closingCents < 0 ? "Short. Plan for this gap." : "Projected balance"}</small>
          </JumpLink>
        </li>
      </ol>
      {overdue.length > 0
        ? <Link className="cash-sum-overdue" href="/invoices?filter=overdue"><DashboardIcon name="alert" size={15} /><span><strong className="num">{formatPHP(overdueCents)}</strong> overdue on {overdue.length} {overdue.length === 1 ? "invoice" : "invoices"}. Chasing it can close the gap.</span><span className="cash-sum-overdue-cta">Review <DashboardIcon name="arrowRight" size={14} /></span></Link>
        : <p className="cash-sum-clear"><DashboardIcon name="check" size={15} />No overdue invoices.</p>}
    </section>
    <NextActions workspace={workspace} limit={5} viewAllHref="/followups" origin="overview" showFollowupAssistant />
    <CashActivity key={workspace.revision} rows={rows} invoices={invoiceList(workspace)} />
    <details id="forecast-review" className={`panel disclosure forecast-review ${checks.length ? "has-checks is-caution" : "is-clear"}`}>
      <summary className="forecast-summary">
        <DashboardIcon name={checks.length ? "alert" : "check"} />
        <span className="forecast-summary-title"><span className="checks-eyebrow">{checks.length ? "Check first" : "All clear"}</span>Before you trust this forecast</span>
        <span className="forecast-summary-meta">
          {checks.length
            ? <span className="check-count">{checks.length} {checks.length === 1 ? "thing" : "things"} to check</span>
            : <span className="check-clear">Nothing to check</span>}
        </span>
        <AppIcon name="chevron-down" />
      </summary>
      <div id="forecast-assumptions">
        <ForecastCheckList checks={checks} />
        {checks.length > 0 && (
          <div className="checks-card-ai">
            <AiContextButton entry={{
              context: { page: "overview" },
              workspace,
              starterText: "Why is cash dipping in the forecast?",
            }}>Check forecast risks</AiContextButton>
          </div>
        )}
      </div>
    </details>
  </WorkspaceShell>;
}
