import Link from "next/link";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "@/components/dashboard-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { ExpenseForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";

type ExpensePageProps = { searchParams: Promise<{ page?: string | string[] }> };

export default async function Expenses({ searchParams }: ExpensePageProps) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  const requestedPage =
    typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const pages = Math.max(1, Math.ceil(workspace.expenses.length / 50));
  const page = Math.min(requestedPage, pages);
  const expenses = [...workspace.expenses]
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
    .slice((page - 1) * 50, page * 50);
  const movements = await getCashMovements("expense_payment", workspace.revision);
  const forecast = calculateForecast(workspace.forecastInput);
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const days = forecast.days.slice(index * 7, index * 7 + 7);
    return { start: days[0].date, end: days.at(-1)!.date, cents: checkedSum(days.map((day) => day.plannedOutCents)) };
  });
  const plannedTotal = checkedSum(weeks.map((week) => week.cents));
  const chartMaximum = Math.max(1, ...weeks.map((week) => week.cents));
  const overdue = workspace.expenses.filter((expense) => expense.unpaid_cents > 0 && expense.due_date < workspace.forecastInput.referenceDate);
  const metrics = [
    { label: "Due in the next 7 days", value: weeks[0].cents, note: "Includes overdue bills due now", tone: "purple" },
    { label: "Overdue unpaid", value: checkedSum(overdue.map((expense) => expense.unpaid_cents)), note: `Overdue bills: ${overdue.length}`, tone: "orange" },
    { label: "Verified expense payments", value: checkedSum(workspace.expenses.map((expense) => expense.paid_cents)), note: "Since opening cutoff · excludes voids", tone: "blue" },
  ];
  return (
    <WorkspaceShell workspace={workspace} className="section-page section-expenses expenses-page" header={
      <header className="section-heading">
        <div><p className="eyebrow">Spend management · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Expenses</h1><p>Manage payroll, supplier bills and upcoming obligations, then verify outgoing payments.</p></div>
        <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /><Link className="section-primary" href="#new-expense"><DashboardIcon name="plus" size={17} />Add an expense</Link></div>
      </header>
    }>
      <section className="section-metrics" aria-label="Expense summary">
        {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}><span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className="num">{formatPHP(value)}</strong><small>{note}</small></article>)}
      </section>
      <section className="section-lower-grid">
      <section className="records-panel">
        <div className="records-head">
          <h2>
            {workspace.expenses.length} recorded{" "}
            {workspace.expenses.length === 1 ? "expense" : "expenses"}
          </h2>
          <span className="muted">PHP</span>
        </div>
        {expenses.length ? (
          <div className="expense-list-scroll" role="region" aria-label="Expense records" tabIndex={0}><ul className="expense-list">
            {expenses.map((expense) => (
              <li id={`expense-${expense.id}`} key={expense.id}>
                <div className="record-row expense-record">
                  <span className="record-icon" aria-hidden="true"><DashboardIcon name="arrowOut" size={16} /></span>
                  <div>
                    <h3>{expense.label}</h3>
                    <p className="muted">
                      {expense.payee} · Original due date {expense.due_date}
                    </p>
                  </div>
                  <div className="num">
                    <strong>{formatPHP(expense.unpaid_cents)}</strong>
                    <p className="muted">Unpaid of {formatPHP(expense.amount_cents)}</p>
                  </div>
                </div>
                {expense.unpaid_cents > 0 &&
                  expense.due_date < workspace.forecastInput.referenceDate && (
                    <p className="negative">
                      Overdue · Included as due now on {workspace.forecastInput.referenceDate}
                    </p>
                  )}
                <details className="disclosure">
                  <summary>Record or review payment</summary>
                  <PaymentForm
                    workspace={workspace}
                    kind="expense_payment"
                    parentId={expense.id}
                    remainingCents={expense.unpaid_cents}
                  />
                </details>
                <details className="disclosure">
                  <summary>Edit expense details</summary>
                  <ExpenseForm workspace={workspace} expense={expense} />
                </details>
              </li>
            ))}
          </ul></div>
        ) : (
          <p className="empty-state">
            No expenses entered. Add upcoming obligations, including payroll and supplier bills.
          </p>
        )}
        {workspace.expenses.length > 50 && (
          <nav className="table-foot" aria-label="Expense pages">
            <span>
              {(page - 1) * 50 + 1}–{Math.min(page * 50, workspace.expenses.length)} of{" "}
              {workspace.expenses.length}
            </span>
            {page > 1 && <Link href={`/expenses?page=${page - 1}`}>Previous 50</Link>}
            {page < pages && <Link href={`/expenses?page=${page + 1}`}>Next 50</Link>}
          </nav>
        )}
      </section>
      <aside className="section-ai-card">
        <span><DashboardIcon name="calendar" size={15} />Obligation check</span>
        <h2>Keep the payment dates visible</h2>
        <p>Overdue unpaid bills are included as due now on {formatPlanDate(workspace.forecastInput.referenceDate)}. Their original due dates stay in the records.</p>
        <p>Record a payment only after checking that money was paid. Partial payments reduce the unpaid amount and the planned outflow together.</p>
        <Link className="expense-source-link" href="/cash#payment-history">Review verified payments <DashboardIcon name="arrowRight" size={15} /></Link>
        <div className="source-note"><span>Based on</span><strong>Saved expense records</strong></div>
      </aside>
      </section>
      <section className="section-feature" aria-label="Upcoming expense analytics">
        <div className="section-feature-copy">
          <span>Planned outflow · 30 days</span><strong className="num">{formatPHP(plannedTotal)}</strong>
          <p>Unpaid amounts only, including overdue bills due now. Verified payments have already reduced these balances.</p>
          <Link className="expense-source-link" href="/forecast">View the cash plan <DashboardIcon name="arrowRight" size={15} /></Link>
        </div>
        <div className="mini-chart" role="region" aria-labelledby="expense-outlook-title">
          <div className="mini-chart-head"><div><strong id="expense-outlook-title">Upcoming expense plan</strong><span>{formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(forecast.days[29].date, true)} · unpaid obligations</span></div><span className="mini-chart-change">30 days</span></div>
          <div className="bars expense-bars" aria-label="Planned outflow grouped into seven-day periods">
            {weeks.map((week) => <button type="button" key={week.start} data-cents={week.cents}
              aria-label={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)} planned`}
              data-tooltip={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)}`}><span aria-hidden="true" style={{ height: `${week.cents / chartMaximum * 100}%` }} /></button>)}
          </div>
          <div className="bar-dates expense-week-labels" aria-hidden="true">{weeks.map((week) => <span key={week.start}>{formatPlanDate(week.start, true)}<small>{formatPHP(week.cents)}</small></span>)}</div>
          <p className="expense-chart-note">Seven-day totals; the final period covers two days. These are planned obligations, not a record of spending already paid.</p>
        </div>
      </section>
      <div className="two-column expense-forms">
        <section id="new-expense" className="records-panel">
          <div className="records-head"><div><h2>Add an upcoming expense</h2><p>Record a bill without posting an actual payment</p></div><DashboardIcon name="plus" size={18} /></div>
          <div className="expense-form-body"><ExpenseForm workspace={workspace} /></div>
        </section>
        <div className="records-panel expense-history-card"><CashMovements workspace={workspace} movements={movements} kind="expense_payment" /></div>
      </div>
    </WorkspaceShell>
  );
}
