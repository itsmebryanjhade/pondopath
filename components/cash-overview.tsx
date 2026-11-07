import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { buildActivityRows } from "@/lib/ui/cash-overview";
import { overviewAnswer, workflowSteps } from "@/lib/ui/overview";
import { CashForecast } from "./cash-forecast";
import { CashActivity } from "./cash-activity";
import { NextActions } from "./next-actions";
import { WorkspaceShell } from "./workspace-shell";
import { RefreshRecords } from "./refresh-records";
import { DashboardIcon } from "./dashboard-icon";
import { HashOpener } from "./hash-opener";

const STEP_MARK = { done: "Done", attention: "Needs you", current: "Next", waiting: "Later" } as const;

export function CashOverview({ workspace, planningTools }: { workspace: WorkspaceSnapshot; planningTools: ReactNode }) {
  const forecast = calculateForecast(workspace.forecastInput);
  const rows = buildActivityRows(workspace);
  const shortage = forecast.firstShortage;
  const answer = overviewAnswer(forecast, workspace.forecastInput.availableCents);
  const overdue = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0 && invoice.due_date < workspace.forecastInput.referenceDate);
  const openFollowups = workspace.followups.filter((task) => task.state === "open").length;
  const steps = workflowSteps({
    records: workspace.invoices.length + workspace.expenses.length, invoices: workspace.invoices.length, expenses: workspace.expenses.length,
    reviews: workspace.intakeReviews?.length ?? 0, shortDate: answer.shortDate, followups: openFollowups,
  });
  const incomplete = forecast.incompleteInvoiceIds.length;
  const member = workspace.members.find((row) => row.user_id === workspace.actor.userId);
  const firstName = member?.display_name?.trim().split(/\s+/)[0];
  const ledger = [
    { label: "Recorded cash", amount: workspace.forecastInput.availableCents, note: "Opening cash plus actual movements", href: "/cash", link: "Open cash ledger" },
    { label: "Expected in 30 days", amount: checkedSum(forecast.days.map((day) => day.expectedInCents)), note: "Not received yet", href: "/invoices", link: "Open invoices" },
    { label: "Due in 30 days", amount: checkedSum(forecast.days.map((day) => day.plannedOutCents)), note: "Includes overdue bills due now", href: "/expenses", link: "Open expenses" },
    { label: "Overdue invoices", amount: checkedSum(overdue.map((invoice) => invoice.outstanding_cents)), note: `${overdue.length} unpaid ${overdue.length === 1 ? "invoice" : "invoices"}`, href: "/invoices?filter=overdue", link: "Review overdue invoices", warn: overdue.length > 0 },
  ];
  return <WorkspaceShell workspace={workspace} className="overview-page" header={
    <header className="dashboard-heading page-heading">
      <div><p className="dashboard-eyebrow">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name} · Asia/Manila</p><h1>{firstName ? `Your cash overview, ${firstName}` : "Your cash overview"}</h1><p>What needs your attention to keep cash moving.</p></div>
      <div className="dashboard-heading-actions"><p className="plan-asof">Plan as of {formatPlanDate(workspace.forecastInput.referenceDate, true)} · PHT</p><RefreshRecords /></div>
    </header>
  }>
    <HashOpener prefix="day-" />
    <nav className="workflow-bar" aria-label="Your cash workflow">
      <ol>{steps.map((step, index) => <li key={step.label} className={`workflow-step is-${step.status}`}>
        <Link href={step.href}>
          <span className="workflow-index" aria-hidden="true">{step.status === "done" ? <DashboardIcon name="check" size={14} /> : index + 1}</span>
          <span className="workflow-copy"><strong>{step.label}</strong><span>{step.detail}</span></span>
          <span className="sr-only">: {STEP_MARK[step.status]}</span>
        </Link>
      </li>)}</ol>
    </nav>

    <div className="overview-main">
      <div className="overview-primary">
        <section id="cash-forecast" className={`answer-card is-${answer.tone}`} aria-labelledby="answer-heading">
          <p className="answer-eyebrow"><DashboardIcon name={answer.tone === "short" ? "alert" : "calendar"} size={15} />{answer.eyebrow}</p>
          <h2 id="answer-heading" className="num">{answer.headline}</h2>
          <dl className="answer-facts">{answer.facts.map((fact) => <div key={fact.text}><dt>{fact.text}</dt><dd className="num">{fact.amount}</dd></div>)}</dl>
          <p className="answer-end">{answer.endNote} Expected payments are counted, but they have not been verified as received.</p>
          {incomplete > 0 && <p className="answer-incomplete">Incomplete plan: {incomplete} unpaid {incomplete === 1 ? "invoice has" : "invoices have"} an amount with no payment date. <Link href="/invoices">Add the dates</Link></p>}
          {!shortage && <p className="answer-caution">Records you haven’t added yet can still change this.</p>}
          {answer.shortDate && <div className="answer-actions">
            <a className="answer-primary" href={`#day-${answer.shortDate}`}>See what’s due by {formatPlanDate(answer.shortDate, true)}<DashboardIcon name="arrowRight" size={16} /></a>
            <Link className="answer-secondary" href="/forecast#forecast-scenario">Try a later payment date</Link>
          </div>}
        </section>
        <div className="overview-chart panel"><CashForecast forecast={forecast} workspace={workspace} overview /></div>
      </div>
      <aside className="overview-side" aria-label="Do next">
        <NextActions workspace={workspace} limit={3} viewAllHref="/followups" heading="Do next" description="Follow-ups and decisions waiting on you." />
      </aside>
    </div>

    <section className="ledger-strip" aria-label="Cash summary">{ledger.map((item) => <article className="ledger-item" key={item.label}>
      <span className="ledger-label">{item.label}</span>
      <strong className="num">{formatPHP(item.amount)}</strong>
      <p className={item.warn ? "warning" : undefined}>{item.note}</p>
      <Link className="ledger-link" href={item.href} aria-label={item.link}><DashboardIcon name="arrowRight" size={16} /></Link>
    </article>)}</section>

    <CashActivity key={workspace.revision} rows={rows} />
    <details id="forecast-review" className="panel disclosure forecast-review">
      <summary>Forecast checks and next steps</summary>
      <p>{shortage ? `The entered plan first falls below zero on ${formatPlanDate(shortage.date)}. Largest projected shortfall: ${formatPHP(forecast.maxShortfallCents)}.` : "There is no calculated shortage in this 30-day window. This does not verify records that have not been entered."}</p>
      <p>{forecast.staleExpectationIds.length} past expectations excluded; {forecast.overdueExpenseIds.length} overdue expenses treated as due now.</p>
      <p>Check actual receipts and confirm customer payment dates before updating a commitment. <Link href="/invoices">Review customer invoices</Link>.</p>
    </details>
    <section className="overview-disclosures" aria-label="Planning tools">{planningTools}</section>
  </WorkspaceShell>;
}
