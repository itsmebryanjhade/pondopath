import Link from "next/link";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "@/components/dashboard-icon";
import { AppIcon } from "@/components/app-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { ExpenseForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";
import { ForecastCheckList } from "@/components/forecast-check-list";
import { forecastChecks } from "@/lib/ui/forecast-checks";
import { addDays } from "@/lib/domain/dates";

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
  const chartMaximum = Math.max(1, ...weeks.map((week) => week.cents));
  const today = workspace.forecastInput.referenceDate;
  const unpaid = workspace.expenses.filter((expense) => expense.unpaid_cents > 0);
  const overdue = unpaid.filter((expense) => expense.due_date < today);
  const dueSoon = unpaid.filter((expense) => expense.due_date >= today && expense.due_date <= addDays(today, 6));
  const later = unpaid.filter((expense) => expense.due_date > addDays(today, 6));
  // What you owe, split by when it is due (original due dates). Verified payments are on the Cash ledger.
  const owed = [
    { label: "Overdue", items: overdue, tone: "late" },
    { label: "Due in the next 7 days", items: dueSoon, tone: "soon" },
    { label: "Due later", items: later, tone: "calm" },
  ];
  // On this page "View all bills" would point to itself, so the check keeps only its named bills.
  const billChecks = forecastChecks(workspace, forecast, "forecast").filter((check) => check.key === "overdue-bills").map((check) => ({ ...check, more: undefined }));
  return (
    <WorkspaceShell workspace={workspace} className="section-page section-expenses expenses-page" header={
      <header className="section-heading">
        <div><p className="eyebrow">Spend management · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Expenses</h1><p>Bills you owe, when they&rsquo;re due, and recording them once they&rsquo;re paid.</p></div>
        <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /><Link className="section-primary" href="/add?type=expense"><DashboardIcon name="plus" size={17} />Add an expense</Link></div>
      </header>
    }>
      <section className="section-lower-grid">
      <section className="records-panel expense-list-card" aria-labelledby="expense-list-heading">
        <div className="records-head">
          <div><h2 id="expense-list-heading">Bills <span className="next-count">{workspace.expenses.length}</span></h2><p>Soonest due first</p></div>
        </div>
        {expenses.length ? (
          <ul className="expense-list">
            {expenses.map((expense) => {
              const paid = expense.unpaid_cents === 0;
              const late = !paid && expense.due_date < today;
              return (
                <li id={`expense-${expense.id}`} key={expense.id} className={`expense-item${late ? " is-overdue" : ""}${paid ? " is-paid" : ""}`}>
                  <div className="expense-row">
                    <div className="expense-who">
                      <strong>{expense.payee || expense.label}</strong>
                      <div className="expense-meta">
                        {expense.payee && expense.payee !== expense.label && <span>{expense.label}</span>}
                        {paid ? <span className="status paid">Paid</span> : (
                          <span>Due <time dateTime={expense.due_date}>{formatPlanDate(expense.due_date, true)}</time></span>
                        )}
                        {late && <span className="status review">Overdue</span>}
                      </div>
                    </div>
                    <div className="expense-amount">
                      <strong className="num">{formatPHP(paid ? expense.amount_cents : expense.unpaid_cents)}</strong>
                      {!paid && <span>{expense.unpaid_cents === expense.amount_cents ? "Left to pay" : `Left of ${formatPHP(expense.amount_cents)}`}</span>}
                    </div>
                  </div>
                  <div className="expense-actions">
                    {!paid && <details className="expense-action" name="bill-actions">
                      <summary className="row-action" aria-label={`Record payment for ${expense.label}`}>
                        Record payment <AppIcon name="chevron-down" />
                      </summary>
                      <div className="expense-action-body">
                        <PaymentForm workspace={workspace} kind="expense_payment" parentId={expense.id} remainingCents={expense.unpaid_cents} />
                      </div>
                    </details>}
                    <details className="expense-action" name="bill-actions">
                      <summary className="row-action is-quiet" aria-label={`Edit bill: ${expense.label}`}>
                        Edit bill <AppIcon name="chevron-down" />
                      </summary>
                      <div className="expense-action-body"><ExpenseForm workspace={workspace} expense={expense} /></div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No expenses entered. <Link href="/add?type=expense">Add your first bill</Link>, such as payroll or a supplier bill.</p>
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
      <aside className={`forecast-checks-card expense-checks ${billChecks.length ? "is-caution" : "is-clear"}`} aria-labelledby="bill-checks-heading">
        <div className="checks-card-head">
          <span className="checks-eyebrow"><DashboardIcon name={billChecks.length ? "alert" : "check"} size={15} />{billChecks.length ? "Check first" : "All clear"}</span>
          <h2 id="bill-checks-heading">Bills to check</h2>
          <p>{billChecks.length ? "Overdue bills count as due today until you record the payment." : "No overdue bills."}</p>
        </div>
        <div className="forecast-checks-body"><ForecastCheckList checks={billChecks} empty="Every bill is paid or not yet due." /></div>
      </aside>
      </section>
      <section className="section-feature owed-panel" aria-label="Bills you owe and when they are due">
        <div className="section-feature-copy owed-summary">
          <span>Bills you owe</span><strong className="num">{formatPHP(checkedSum(unpaid.map((expense) => expense.unpaid_cents)))}</strong>
          <p>{unpaid.length} unpaid {unpaid.length === 1 ? "bill" : "bills"} · not paid yet</p>
          <ul className="owed-breakdown" aria-label="Owed by due date">
            {owed.map((row) => <li key={row.label} className={`is-${row.tone}`}><div>
              <span>{row.label}<small>{row.items.length} {row.items.length === 1 ? "bill" : "bills"}</small></span>
              <strong className="num">{formatPHP(checkedSum(row.items.map((expense) => expense.unpaid_cents)))}</strong>
            </div></li>)}
          </ul>
        </div>
        <div className="mini-chart" role="region" aria-labelledby="expense-outlook-title">
          <div className="mini-chart-head"><div><strong id="expense-outlook-title">When bills are due</strong><span>By week · {formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(forecast.days[29].date, true)} · overdue bills count in the first week</span></div><span className="mini-chart-change">30 days</span></div>
          <div className="bars expense-bars" aria-label="Planned outflow grouped into seven-day periods">
            {weeks.map((week) => <button type="button" key={week.start} data-cents={week.cents}
              aria-label={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)} planned`}
              data-tooltip={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)}`}><span aria-hidden="true" style={{ height: `${week.cents / chartMaximum * 100}%` }} /></button>)}
          </div>
          <div className="bar-dates expense-week-labels" aria-hidden="true">{weeks.map((week) => <span key={week.start}>{formatPlanDate(week.start, true)}<small>{formatPHP(week.cents)}</small></span>)}</div>
          <p className="expense-chart-note">What you still owe, not money already paid. The last bar covers two days.</p>
        </div>
      </section>
      <section className="records-panel expense-history-card" id="bill-payments"><CashMovements workspace={workspace} movements={movements} kind="expense_payment" /></section>
    </WorkspaceShell>
  );
}
