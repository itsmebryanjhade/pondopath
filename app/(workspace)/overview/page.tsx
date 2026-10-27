import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { formatPHP, checkedSum } from "@/lib/domain/money";
import { calculateForecast } from "@/lib/domain/forecast";
import { headers } from "next/headers";
import { LOGIN_NOTICE_HEADER } from "@/lib/auth-notice";
import { AuthToast } from "@/components/auth-toast";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CashForecast } from "@/components/cash-forecast";
import { OpeningCashForm } from "@/components/record-forms";

export default async function Overview() {
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
  return (
    <WorkspaceShell workspace={workspace} active="/overview">
      {showLoginToast && (
        <AuthToast kind="success" message="You’re signed in. Your business cash plan is ready." />
      )}
      <div className="page-heading">
        <div>
          <h1>Cash overview</h1>
          <p className={shortage ? "negative" : "muted"}>
            {shortage
              ? `Cash may fall below zero on ${shortage.date}. Review the recorded plan.`
              : "Will recorded cash and expected receipts cover upcoming obligations?"}
          </p>
        </div>
        <Link className="button" href="/invoices">
          Review customer invoices
        </Link>
      </div>
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
            <small>Planning assumptions, not money received</small>
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
        <section className="panel cash-finding" aria-labelledby="finding-heading">
          <h2 id="finding-heading">
            {shortage ? "First projected shortage" : "Entered plan stays above zero"}
          </h2>
          {shortage ? (
            <>
              <p className="shortage-amount negative num">{formatPHP(shortage.shortfallCents)}</p>
              <p>
                Cash is projected below zero on <strong>{shortage.date}</strong>.
              </p>
              <p className="muted">
                Largest projected shortfall:{" "}
                <span className="num">{formatPHP(forecast.maxShortfallCents)}</span>.
              </p>
            </>
          ) : (
            <p>
              There is no calculated shortage in this 30-day window. Missing or unconfirmed records
              can still change the result.
            </p>
          )}
          <h3>What needs attention</h3>
          <ul className="attention-list">
            <li>
              {unpaid.length} unpaid {unpaid.length === 1 ? "invoice" : "invoices"} to review.{" "}
              <Link href="/invoices">Check collections</Link>
            </li>
            <li>
              {forecast.incompleteInvoiceIds.length}{" "}
              {forecast.incompleteInvoiceIds.length === 1 ? "invoice has" : "invoices have"}{" "}
              unplanned amounts or no usable expectation.
            </li>
            <li>
              {forecast.staleExpectationIds.length} past expectations excluded;{" "}
              {forecast.overdueExpenseIds.length} overdue expenses treated as due now.
            </li>
          </ul>
          <p className="muted">
            Check actual receipts before following up. Expected payments cannot guarantee funds will
            arrive.
          </p>
        </section>
        <CashForecast forecast={forecast} workspace={workspace} />
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>Customer payments to check</h2>
            <Link href="/invoices">View all</Link>
          </div>
          {unpaid.length ? (
            <ul className="money-list">
              {unpaid.slice(0, 4).map((invoice) => (
                <li key={invoice.id}>
                  <div>
                    <Link href={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                    <p className="muted">
                      {
                        workspace.customers.find((customer) => customer.id === invoice.customer_id)
                          ?.name
                      }{" "}
                      · Due {invoice.due_date}
                    </p>
                  </div>
                  <span className="num">{formatPHP(invoice.outstanding_cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              No unpaid invoices. Add an existing unpaid invoice from Customer invoices.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Upcoming obligations</h2>
            <Link href="/expenses">View all</Link>
          </div>
          {expenses.length ? (
            <ul className="money-list">
              {expenses.slice(0, 4).map((expense) => (
                <li key={expense.id}>
                  <div>
                    <Link href={`/expenses#expense-${expense.id}`}>{expense.label}</Link>
                    <p className="muted">
                      {expense.payee} ·{" "}
                      {expense.due_date < workspace.forecastInput.referenceDate
                        ? `Overdue ${expense.due_date} · Due now`
                        : `Due ${expense.due_date}`}
                    </p>
                  </div>
                  <span className="num">{formatPHP(expense.unpaid_cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              No unpaid expenses entered. Add upcoming payroll, supplier bills and other
              obligations.
            </p>
          )}
        </section>
      </div>
      <details className="panel disclosure">
        <summary>
          Opening cash baseline · {formatPHP(workspace.business.opening_cash_cents)} on{" "}
          {workspace.business.opening_date}
        </summary>
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
    </WorkspaceShell>
  );
}
