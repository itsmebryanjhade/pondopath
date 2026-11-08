import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import type { ForecastResult } from "@/lib/domain/types";
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

export type InvoiceListItem = { id: string; number: string; customer: string; outstandingCents: number; totalCents: number; dueDate: string; state: "overdue" | "open" | "paid" };

/** Every invoice for the Overview's "Review invoices" panel: overdue first, then open by due date, then paid. */
export function invoiceList(workspace: WorkspaceSnapshot): InvoiceListItem[] {
  const today = workspace.forecastInput.referenceDate;
  const rank = { overdue: 0, open: 1, paid: 2 } as const;
  return workspace.invoices.map((invoice) => ({
    id: invoice.id, number: invoice.number,
    customer: workspace.customers.find((row) => row.id === invoice.customer_id)?.name ?? "Customer unavailable",
    outstandingCents: invoice.outstanding_cents, totalCents: invoice.amount_cents, dueDate: invoice.due_date,
    state: invoice.outstanding_cents <= 0 ? "paid" as const : invoice.due_date < today ? "overdue" as const : "open" as const,
  })).sort((a, b) => rank[a.state] - rank[b.state] || a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
}

export type WorkspaceSearchRow = Pick<ActivityRow, "id" | "kind" | "label" | "reference" | "href" | "status">;

export function paidInvoiceSearchRows(workspace: WorkspaceSnapshot): WorkspaceSearchRow[] {
  return invoiceList(workspace).filter((invoice) => invoice.state === "paid").map((invoice) => ({
    id: invoice.id, kind: "invoice", label: invoice.customer, reference: invoice.number,
    href: `/invoices/${invoice.id}`, status: "Paid",
  }));
}

export function searchWorkspaceRecords(rows: WorkspaceSearchRow[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { results: [], direct: undefined };
  const matches = rows.filter((row) => `${row.label} ${row.reference}`.toLocaleLowerCase().includes(needle));
  const exact = matches.filter((row) => row.kind === "invoice" && row.reference.toLocaleLowerCase() === needle);
  const direct = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : undefined;
  const results = direct ? [direct, ...matches.filter((row) => row !== direct)] : matches;
  return { results: results.slice(0, 6), direct };
}

export type ExpectedReceipt = { id: string; number: string; customer: string; amountCents: number; date: string };

/** Customer payments the 30-day forecast expects but that are not cash yet, soonest first. Same amounts the forecast counts. */
export function expectedReceipts(workspace: WorkspaceSnapshot, forecast: ForecastResult): ExpectedReceipt[] {
  return forecast.days.flatMap((day) => day.invoiceIds.flatMap((id) => {
    const invoice = workspace.invoices.find((row) => row.id === id);
    const planned = workspace.forecastInput.invoices.find((row) => row.id === id);
    if (!invoice || !planned?.expectation) return [];
    return [{ id, number: invoice.number, customer: workspace.customers.find((row) => row.id === invoice.customer_id)?.name ?? "Customer unavailable",
      amountCents: planned.expectation.remainingCents, date: day.date }];
  }));
}

type Movement = { id: string; kind: string; reference: string | null; amount_cents: number; payment_date: string; created_at: string; invoice_id: string | null; expense_id: string | null; voided_at: string | null; void_reason: string | null };
export type HistoryRow = { id: string; direction: "in" | "out"; who: string; what: string; reference: string | null; amountCents: number; paymentDate: string; voided: boolean; voidReason: string | null; href: string };

/** Receipts and expense payments as one history, newest recorded first. Each row links to the record where it can be voided. */
export function historyRows(workspace: WorkspaceSnapshot, movements: Movement[]): HistoryRow[] {
  return [...movements].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map((movement) => {
    const isReceipt = movement.kind === "receipt";
    const invoice = isReceipt ? workspace.invoices.find((row) => row.id === movement.invoice_id) : undefined;
    const expense = isReceipt ? undefined : workspace.expenses.find((row) => row.id === movement.expense_id);
    // Lead with who paid or was paid; the invoice or bill comes second.
    const who = isReceipt ? workspace.customers.find((row) => row.id === invoice?.customer_id)?.name : expense?.payee || expense?.label;
    return {
      id: movement.id, direction: isReceipt ? "in" : "out",
      who: who ?? "Related record", what: (isReceipt ? invoice?.number : expense?.label) ?? "Related record",
      reference: movement.reference || null, amountCents: movement.amount_cents, paymentDate: movement.payment_date,
      voided: !!movement.voided_at, voidReason: movement.void_reason,
      href: isReceipt ? `/invoices/${movement.invoice_id}?movement=${movement.id}#movement-${movement.id}` : `/expenses#movement-${movement.id}`,
    };
  });
}

