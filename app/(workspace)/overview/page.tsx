import Link from "next/link";
import { Suspense } from "react";
import WorkspaceLoading from "../loading";
import { getWorkspace } from "@/lib/server/workspace";
import { formatPHP, checkedSum } from "@/lib/domain/money";
import { calculateForecast } from "@/lib/domain/forecast";
import { headers } from "next/headers";
import { LOGIN_NOTICE_HEADER } from "@/lib/auth-notice";
import { AuthToast } from "@/components/auth-toast";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CashForecast } from "@/components/cash-forecast";
import { OpeningCashForm } from "@/components/record-forms";
import { ScenarioPanel } from "@/components/scenario-panel";
import { RefreshRecords } from "@/components/refresh-records";
import { AppIcon } from "@/components/app-icon";
import { expectedReceiptLabel, formatPlanDate } from "@/lib/display";

export default function Overview() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <OverviewContent />
    </Suspense>
  );
}

async function OverviewContent() {
  const workspace = await getWorkspace();
  const forecast = calculateForecast(workspace.forecastInput);
  const showLoginToast = (await headers()).get(LOGIN_NOTICE_HEADER) === "signed-in";
  const unpaid = workspace.invoices
    .filter((row) => row.outstanding_cents > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const expenses = workspace.expenses
    .filter((row) => row.unpaid_cents > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const shortage = forecast.firstShortage;
  const expectedReceipts = checkedSum(forecast.days.map((day) => day.expectedInCents));
  const plannedExpenses = checkedSum(forecast.days.map((day) => day.plannedOutCents));
  const compactMetrics = expectedReceipts < 10_000_000 && plannedExpenses < 10_000_000;
  const nextInvoice = unpaid[0];
  return (
    <WorkspaceShell workspace={workspace} header={
      <header className="overview-header">
        <div className="overview-title">
          <h1>Cash overview</h1>
          <p>A clear view of recorded cash, expected receipts, and upcoming bills.</p>
        </div>
        <div className="overview-controls">
          <p className="overview-date"><span className="workspace-context">{workspace.business.is_demo ? "Fictional demo" : "Business workspace"}</span><span>{formatPlanDate(workspace.forecastInput.referenceDate)} · Asia/Manila</span></p>
          <div className="overview-actions"><RefreshRecords /><Link className="button" href="/invoices">Review customer invoices</Link></div>
        </div>
      </header>
    }>
      {showLoginToast && (
        <AuthToast kind="success" message="You’re signed in. Your business cash plan is ready." />
      )}
      <dl className={`cash-metrics${compactMetrics ? " compact-metrics" : ""}`}>
        <div>
          <dt>Recorded available cash</dt>
          <dd>
            {formatPHP(workspace.forecastInput.availableCents)}
            <small>Opening cash plus verified movements</small>
          </dd>
        </div>
        <div>
          <dt>Expected receipts · 30 days</dt>
          <dd>
            {formatPHP(expectedReceipts)}
            <small>Expected, not money received</small>
          </dd>
        </div>
        <div>
          <dt>Unpaid obligations · 30 days</dt>
          <dd>
            {formatPHP(plannedExpenses)}
            <small>Includes overdue expenses due now</small>
          </dd>
        </div>
      </dl>
      <div className="forecast-grid">
        <section className={`panel cash-finding${shortage ? " has-shortage" : ""}`} aria-labelledby="finding-heading">
          <p className="finding-status">{shortage ? "Needs attention" : "Entered plan"}</p>
          <h2 id="finding-heading">
            {shortage ? "Projected cash gap" : "No projected cash gap"}
          </h2>
          {shortage ? (
            <>
              <p className="shortage-amount num">{formatPHP(shortage.shortfallCents)}</p>
              <p className="shortage-date">on <strong>{formatPlanDate(shortage.date)}</strong></p>
              <p>Projected obligations exceed recorded cash and expected receipts by this date.</p>
              {forecast.maxShortfallCents !== shortage.shortfallCents && <p className="muted">
                Largest projected shortfall:{" "}
                <span className="num">{formatPHP(forecast.maxShortfallCents)}</span>.
              </p>}
            </>
          ) : (
            <p>
              There is no calculated shortage in this 30-day window. Missing or unconfirmed records
              can still change the result.
            </p>
          )}
          <div className="finding-action">
            <h3>Next step</h3>
            <Link href={nextInvoice ? `/invoices/${nextInvoice.id}` : "/expenses"}>{nextInvoice ? `Review ${nextInvoice.number}` : "Review upcoming obligations"}</Link>
            <p className="muted">{nextInvoice ? "Check actual receipts and confirm the customer’s payment date." : "Check due dates and the remaining unpaid amounts."}</p>
          </div>
          {forecast.incompleteInvoiceIds.length > 0 && (
            <p className="finding-note">
              Incomplete plan: {forecast.incompleteInvoiceIds.length} unpaid {forecast.incompleteInvoiceIds.length === 1 ? "invoice has" : "invoices have"} unplanned amounts or no usable expected payment. <Link href="/invoices">Review invoices</Link>.
            </p>
          )}
          <details className="record-checks">
          <summary>Records to review</summary>
          <ul className="attention-list">
            <li>
              {unpaid.length} unpaid {unpaid.length === 1 ? "invoice" : "invoices"} to review.{" "}
              <Link href="/invoices">Check collections</Link>
            </li>
            <li>
              {forecast.staleExpectationIds.length} past expectations excluded;{" "}
              {forecast.overdueExpenseIds.length} overdue expenses treated as due now.
            </li>
          </ul>
          </details>
          <p className="finding-note muted">Projected from entered records; actual payments may differ.</p>
        </section>
        <CashForecast forecast={forecast} workspace={workspace} />
      </div>
      <div className="overview-records">
        <section className="panel">
          <div className="section-heading">
            <h2>Customer payments</h2>
            <Link href="/invoices">View all invoices</Link>
          </div>
          {unpaid.length ? (
            <div className="table-scroll" role="region" aria-label="Unpaid customer invoices" tabIndex={0}>
              <table className="overview-table"><caption className="sr-only">Unpaid invoices with original due dates and current expected receipts</caption>
                <thead><tr><th scope="col">Invoice</th><th scope="col">Customer</th><th scope="col" className="num">Outstanding</th><th scope="col">Original due</th><th scope="col">Expected receipt</th></tr></thead>
                <tbody>{unpaid.slice(0, 4).map((invoice) => {
                  return <tr key={invoice.id}>
                    <th scope="row"><Link href={`/invoices/${invoice.id}`}>{invoice.number}</Link></th>
                    <td>{workspace.customers.find((customer) => customer.id === invoice.customer_id)?.name ?? "Customer unavailable"}</td>
                    <td className="num">{formatPHP(invoice.outstanding_cents)}</td>
                    <td>{formatPlanDate(invoice.due_date)}</td>
                    <td>{expectedReceiptLabel(workspace.forecastInput.invoices.find((row) => row.id === invoice.id), workspace.forecastInput.referenceDate)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              No unpaid invoices. Add an existing unpaid invoice from Customer invoices.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Upcoming obligations</h2>
            <Link href="/expenses">View all expenses</Link>
          </div>
          {expenses.length ? (
            <div className="table-scroll" role="region" aria-label="Unpaid upcoming obligations" tabIndex={0}>
              <table className="overview-table"><caption className="sr-only">Upcoming and overdue obligations with unpaid amounts</caption>
                <thead><tr><th scope="col">Description</th><th scope="col" className="num">Unpaid amount</th><th scope="col">Due date</th></tr></thead>
                <tbody>{expenses.slice(0, 4).map((expense) => <tr key={expense.id}>
                  <th scope="row"><Link href={`/expenses#expense-${expense.id}`}>{expense.label}</Link><small>{expense.payee}</small></th>
                  <td className="num">{formatPHP(expense.unpaid_cents)}</td>
                  <td>{formatPlanDate(expense.due_date)}{expense.due_date < workspace.forecastInput.referenceDate && <small className="negative">Overdue · due now</small>}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              No unpaid expenses entered. Add upcoming payroll, supplier bills and other
              obligations.
            </p>
          )}
        </section>
      </div>
      <section className="overview-disclosures" aria-label="Planning tools">
      <ScenarioPanel key={workspace.revision} workspace={workspace} />
      <details className="panel disclosure">
        <summary>
          <AppIcon name="book-open" /><span>Opening cash baseline</span><AppIcon name="chevron-down" />
        </summary>
        <p className="muted">Recorded opening cash: {formatPHP(workspace.business.opening_cash_cents)} on {formatPlanDate(workspace.business.opening_date)}.</p>
        {workspace.business.opening_locked_at ? (
          <p className="muted">
            Locked after the first actual movement. Correct a mistaken movement by voiding its
            retained entry; a baseline reset is outside this workspace.
          </p>
        ) : workspace.actor.role === "owner" ? (
          <OpeningCashForm workspace={workspace} />
        ) : (
          <p className="muted">Only the owner can set the opening cash baseline.</p>
        )}
      </details>
      </section>
    </WorkspaceShell>
  );
}
