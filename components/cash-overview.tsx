import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { buildActivityRows } from "@/lib/ui/cash-overview";
import { CashForecast } from "./cash-forecast";
import { CashActivity } from "./cash-activity";
import { WorkspaceShell } from "./workspace-shell";
import { RefreshRecords } from "./refresh-records";
import { DashboardIcon } from "./dashboard-icon";

export function CashOverview({ workspace, planningTools }: { workspace: WorkspaceSnapshot; planningTools: ReactNode }) {
  const forecast = calculateForecast(workspace.forecastInput);
  const rows = buildActivityRows(workspace);
  const end = forecast.days[29];
  const shortage = forecast.firstShortage;
  const overdue = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0 && invoice.due_date < workspace.forecastInput.referenceDate);
  const member = workspace.members.find((row) => row.user_id === workspace.actor.userId);
  const firstName = member?.display_name?.trim().split(/\s+/)[0];
  const metrics = [
    { label: "Available cash", amount: workspace.forecastInput.availableCents, note: "Recorded cash, including actual movements", icon: "wallet", tone: "green", href: "#opening-cash" },
    { label: "Expected receipts", amount: checkedSum(forecast.days.map((day) => day.expectedInCents)), note: "Next 30 days · not received cash", icon: "arrowIn", tone: "blue", href: "/invoices" },
    { label: "Upcoming expenses", amount: checkedSum(forecast.days.map((day) => day.plannedOutCents)), note: "Next 30 days, including overdue due-now bills", icon: "arrowOut", tone: "purple", href: "/expenses" },
    { label: "Overdue invoices", amount: checkedSum(overdue.map((invoice) => invoice.outstanding_cents)), note: `${overdue.length} unpaid ${overdue.length === 1 ? "invoice needs" : "invoices need"} review`, icon: "alert", tone: "orange", href: "/invoices?filter=overdue" },
  ] as const;
  return <WorkspaceShell workspace={workspace} header={
    <header className="dashboard-heading page-heading">
      <div><p className="dashboard-eyebrow">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name} · Asia/Manila</p><h1>{firstName ? `Your cash overview, ${firstName}` : "Your cash overview"}</h1><p>Here’s what needs your attention to keep cash moving.</p></div>
      <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /></div>
    </header>
  }>
    <div id="cash-forecast" className="overview-hero hero-panel">
      <section className="hero-summary" aria-labelledby="outlook-heading">
        <p className="outlook-label ai-label"><DashboardIcon name="sparkle" size={15} />Cash-flow outlook</p>
        <h2 id="outlook-heading">Projected cash in 30 days</h2>
        <p className={`hero-value num${end.closingCents < 0 ? " below-zero" : ""}`}>{formatPHP(end.closingCents)}</p>
        <p className="hero-copy">This projection includes expected payments that have not been verified as received.</p>
        <div className={`hero-shortfall shortfall${shortage ? " has-gap" : ""}`}>
          <DashboardIcon name={shortage ? "alert" : "calendar"} />
          <div><h3>{shortage ? "Earliest projected shortfall" : "No projected shortage"}</h3><strong className="num">{shortage ? `${formatPlanDate(shortage.date, true)} · ${formatPHP(shortage.shortfallCents)} gap` : "Based on entered records"}</strong></div>
          <Link href="#forecast-review" aria-label="Review cash forecast details"><DashboardIcon name="arrowRight" /></Link>
        </div>
        {forecast.incompleteInvoiceIds.length > 0 && <p className="hero-incomplete">Incomplete plan: {forecast.incompleteInvoiceIds.length} unpaid {forecast.incompleteInvoiceIds.length === 1 ? "invoice has" : "invoices have"} unplanned amounts or no usable expected payment. <Link href="/invoices">Review invoices</Link>.</p>}
        {!shortage && <p className="hero-caution">Missing or unconfirmed records can still change the result.</p>}
      </section>
      <CashForecast forecast={forecast} workspace={workspace} />
    </div>
    <dl className="dashboard-metrics summary-grid" aria-label="Cash summary">{metrics.map((metric) => <div className="summary-card" key={metric.label}>
      <dt><span aria-hidden="true" className={`metric-icon card-icon ${metric.tone}`}><DashboardIcon name={metric.icon} size={21} /></span><Link href={metric.href}>{metric.label}</Link></dt><dd className="num"><strong>{formatPHP(metric.amount)}</strong><small className={metric.tone === "orange" ? "warning" : ""}>{metric.note}</small></dd>
    </div>)}</dl>
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
