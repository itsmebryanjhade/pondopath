import Link from "next/link";
import { Suspense } from "react";
import WorkspaceLoading from "../loading";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ExpenseForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";

type ExpensePageProps = { searchParams: Promise<{ page?: string }> };

export default function Expenses(props: ExpensePageProps) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ExpensesContent {...props} />
    </Suspense>
  );
}

async function ExpensesContent({ searchParams }: ExpensePageProps) {
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
  return (
    <WorkspaceShell workspace={workspace}>
      <div className="page-heading">
        <div>
          <h1>Expenses & payments</h1>
          <p className="muted">
            Record payroll, supplier bills and other obligations, then verify actual payments.
          </p>
        </div>
        <a className="button" href="#new-expense">
          Add an expense
        </a>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            {workspace.expenses.length} recorded{" "}
            {workspace.expenses.length === 1 ? "expense" : "expenses"}
          </h2>
          <span className="muted">PHP</span>
        </div>
        {expenses.length ? (
          <ul className="expense-list">
            {expenses.map((expense) => (
              <li id={`expense-${expense.id}`} key={expense.id}>
                <div className="section-heading">
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
          </ul>
        ) : (
          <p className="empty-state">
            No expenses entered. Add upcoming obligations, including payroll and supplier bills.
          </p>
        )}
        {workspace.expenses.length > 50 && (
          <nav className="pagination" aria-label="Expense pages">
            <span>
              {(page - 1) * 50 + 1}–{Math.min(page * 50, workspace.expenses.length)} of{" "}
              {workspace.expenses.length}
            </span>
            {page > 1 && <Link href={`/expenses?page=${page - 1}`}>Previous 50</Link>}
            {page < pages && <Link href={`/expenses?page=${page + 1}`}>Next 50</Link>}
          </nav>
        )}
      </section>
      <div className="two-column form-panels">
        <section id="new-expense" className="panel">
          <h2>Add an upcoming expense</h2>
          <ExpenseForm workspace={workspace} />
        </section>
        <CashMovements workspace={workspace} movements={movements} />
      </div>
    </WorkspaceShell>
  );
}
