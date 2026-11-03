import Link from "next/link";
import { notFound } from "next/navigation";
import { getCashMovements, getRecordHistory, getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InvoiceForm, CustomerForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";
import { CollectionPanel } from "@/components/collection-panel";
import { FollowupPanel } from "@/components/followup-panel";
import { ScenarioPanel } from "@/components/scenario-panel";
import { RecordHistory } from "@/components/record-history";
import { ReminderPanel } from "@/components/reminder-panel";
import { reminderTemplate } from "@/lib/domain/reminders";
import { z } from "zod";

type InvoiceDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string; movement?: string; plan?: string }>;
};

export default async function InvoiceDetail({ params, searchParams }: InvoiceDetailProps) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const invoice = workspace.invoices.find((row) => row.id === id);
  if (!invoice) notFound();
  const customer = workspace.customers.find((row) => row.id === invoice.customer_id)!;
  const reminderDraft = reminderTemplate({
    contactName: customer.contact_name,
    invoiceNumber: invoice.number,
    outstandingCents: invoice.outstanding_cents,
    dueDate: invoice.due_date,
    referenceDate: workspace.forecastInput.referenceDate,
  });
  const query = await searchParams;
  if (query.movement && !z.uuid().safeParse(query.movement).success) notFound();
  const [movements, history] = await Promise.all([
    getCashMovements("receipt", workspace.revision, invoice.id, query.movement),
    getRecordHistory("invoice", invoice.id, query.history, workspace.revision),
  ]);
  if (query.movement && !movements.length) notFound();
  return (
    <WorkspaceShell workspace={workspace}>
      <Link className="back-link" href="/invoices">
        ← Customer invoices
      </Link>
      <div className="page-heading">
        <div>
          <h1>{invoice.number}</h1>
          <p className="muted">
            {customer.name} · Original due date {invoice.due_date}
          </p>
        </div>
      </div>
      <dl className="cash-metrics">
        <div>
          <dt>Outstanding invoice</dt>
          <dd>{formatPHP(invoice.outstanding_cents)}</dd>
        </div>
        <div>
          <dt>Verified receipts</dt>
          <dd>{formatPHP(invoice.paid_cents)}</dd>
        </div>
        <div>
          <dt>Original invoice total</dt>
          <dd>{formatPHP(invoice.amount_cents)}</dd>
        </div>
      </dl>
      <div className="two-column form-panels">
        <section className="panel">
          <h2>Record a verified receipt</h2>
          <PaymentForm
            workspace={workspace}
            kind="receipt"
            parentId={invoice.id}
            remainingCents={invoice.outstanding_cents}
          />
        </section>
        <CollectionPanel workspace={workspace} invoice={invoice} openPlan={query.plan === "edit"} />
      </div>
      <ScenarioPanel key={workspace.revision} workspace={workspace} invoiceId={invoice.id} />
      <FollowupPanel workspace={workspace} invoice={invoice} />
      <ReminderPanel workspace={workspace} invoice={invoice} customer={customer} template={reminderDraft} />
      <CashMovements workspace={workspace} movements={movements} selected={!!query.movement} />
      {query.movement && (
        <Link className="back-link" href={`/invoices/${invoice.id}#payment-history`}>
          Back to recent payments
        </Link>
      )}
      <div className="two-column form-panels">
        <details className="panel disclosure">
          <summary>Edit invoice details</summary>
          <InvoiceForm workspace={workspace} invoice={invoice} />
        </details>
        <details className="panel disclosure">
          <summary>Customer contact · {customer.contact_name}</summary>
          <CustomerForm workspace={workspace} customer={customer} />
        </details>
      </div>
      <RecordHistory
        invoiceId={invoice.id}
        {...history}
        cursor={query.history}
        members={workspace.members}
      />
    </WorkspaceShell>
  );
}
