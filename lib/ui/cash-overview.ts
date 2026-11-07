import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { expectedReceiptLabel, expenseLinks } from "@/lib/display";

export type ActivityFilter = "all" | "invoices" | "expenses" | "attention";
export type ActivityRow = {
  id: string;
  kind: "invoice" | "expense";
  label: string;
  reference: string;
  amountCents: number;
  dueDate: string;
  expected: string;
  status: string;
  tone: "overdue" | "review" | "expected" | "upcoming";
  needsAttention: boolean;
  href: string;
};

export function buildActivityRows(workspace: WorkspaceSnapshot): ActivityRow[] {
  const today = workspace.forecastInput.referenceDate;
  const expenseHrefs = expenseLinks(workspace.expenses);
  const invoices: ActivityRow[] = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0).map((invoice) => {
    const planned = workspace.forecastInput.invoices.find((row) => row.id === invoice.id);
    const expectation = planned?.expectation;
    const incomplete = !expectation || expectation.needsReview || expectation.date < today || expectation.remainingCents < invoice.outstanding_cents;
    const overdue = invoice.due_date < today;
    return {
      id: invoice.id, kind: "invoice", label: workspace.customers.find((row) => row.id === invoice.customer_id)?.name ?? "Customer unavailable",
      reference: invoice.number, amountCents: invoice.outstanding_cents, dueDate: invoice.due_date,
      expected: expectedReceiptLabel(planned, today), status: overdue ? "Overdue" : incomplete ? "Needs review" : "Expected",
      tone: overdue ? "overdue" : incomplete ? "review" : "expected", needsAttention: overdue || incomplete,
      href: `/invoices/${invoice.id}`,
    };
  });
  const expenses: ActivityRow[] = workspace.expenses.filter((expense) => expense.unpaid_cents > 0).map((expense) => ({
    id: expense.id, kind: "expense", label: expense.payee || expense.label, reference: expense.label,
    amountCents: expense.unpaid_cents, dueDate: expense.due_date, expected: "Planned expense; not a payment",
    status: expense.due_date < today ? "Overdue · due now" : "Upcoming",
    tone: expense.due_date < today ? "overdue" : "upcoming", needsAttention: expense.due_date < today,
    href: expenseHrefs.get(expense.id)!,
  }));
  return [...invoices, ...expenses].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}

export function filterActivityRows(rows: ActivityRow[], filter: ActivityFilter, query = ""): ActivityRow[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (filter === "all" || (filter === "invoices" && row.kind === "invoice") || (filter === "expenses" && row.kind === "expense") || (filter === "attention" && row.needsAttention)) && (!needle || `${row.label} ${row.reference}`.toLocaleLowerCase().includes(needle)));
}
