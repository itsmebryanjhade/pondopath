import Link from "next/link";
import { notFound } from "next/navigation";
import { getCashMovements, getRecordHistory, getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { AppIcon } from "@/components/app-icon";
import { JumpLink } from "@/components/jump-link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InvoiceForm, CustomerForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";
import { CollectionPanel } from "@/components/collection-panel";
import { FollowupPanel } from "@/components/followup-panel";
import { ScenarioPanel } from "@/components/scenario-panel";
import { RecordHistory } from "@/components/record-history";
import { ReminderPanel } from "@/components/reminder-panel";
import { AiContextButton } from "@/components/ai-context-button";
import { reminderTemplate } from "@/lib/domain/reminders";
import { z } from "zod";

type InvoiceDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string; movement?: string; plan?: string; from?: string }>;
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
  const paid = invoice.outstanding_cents === 0;
  const overdue = !paid && invoice.due_date < workspace.forecastInput.referenceDate;
  const status = paid ? "Paid" : overdue ? "Overdue" : "Unpaid";
  const fromOverview = query.from === "overview";
  return (
    <WorkspaceShell workspace={workspace} className="invoice-detail-page" header={
      <header className="invoice-detail-header">
        <Link className="back-link" href={fromOverview ? "/overview#cash-activity" : "/invoices"}>
          {fromOverview ? "← Back to overview" : "← All invoices"}
        </Link>
        <div className="invoice-identity">
          <div>
            <p className="eyebrow">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p>
            <h1>{invoice.number}</h1>
            <p className="muted">{customer.name}</p>
          </div>
          <div className="invoice-due-meta">
            <span>Original due <time dateTime={invoice.due_date}>{formatPlanDate(invoice.due_date)}</time></span>
            <span className={`invoice-state${paid ? " is-paid" : overdue ? " is-overdue" : ""}`}>{status}</span>
          </div>
        </div>
        <p className="muted invoice-plan-asof">
          Plan as of <time dateTime={workspace.forecastInput.referenceDate}>{formatPlanDate(workspace.forecastInput.referenceDate)}</time>
        </p>
      </header>
    }>
      <section className="panel invoice-balance" aria-label="Invoice balance">
        <dl className="invoice-balances">
          <div><dt>Still owed</dt><dd className="num">{formatPHP(invoice.outstanding_cents)}</dd></div>
          <div><dt>Received</dt><dd className="num">{formatPHP(invoice.paid_cents)}</dd></div>
          <div><dt>Invoice total</dt><dd className="num">{formatPHP(invoice.amount_cents)}</dd></div>
        </dl>
        <AiContextButton entry={{
          context: { page: "invoices", record: { kind: "invoice", id: invoice.id } },
          workspace, starterText: "Explain this outstanding balance",
        }}>Explain balance with AI</AiContextButton>
        {!paid && (
          <details className="invoice-record-payment">
            <summary className="button">Record payment <AppIcon name="chevron-down" /></summary>
            <PaymentForm
              workspace={workspace}
              kind="receipt"
              parentId={invoice.id}
              remainingCents={invoice.outstanding_cents}
            />
          </details>
        )}
      </section>
      <nav className="invoice-section-links" aria-label="On this invoice">
        <JumpLink target="collection-plan" className="row-action">Expected payment</JumpLink>
        <JumpLink target="invoice-followups" className="row-action">Follow-ups</JumpLink>
        <JumpLink target="payment-history" className="row-action">Payments</JumpLink>
        <JumpLink target="record-history" className="row-action">History</JumpLink>
      </nav>
      <div className="invoice-work-grid">
        <CollectionPanel workspace={workspace} invoice={invoice} openPlan={query.plan === "edit"} />
        <div id="invoice-followups"><FollowupPanel workspace={workspace} invoice={invoice} /></div>
      </div>
      <section className="invoice-tools" aria-labelledby="invoice-tools-heading">
        <h2 id="invoice-tools-heading">More actions</h2>
        <div className="overview-disclosures">
          <ReminderPanel workspace={workspace} invoice={invoice} customer={customer} template={reminderDraft} collapsible />
          <ScenarioPanel key={workspace.revision} workspace={workspace} invoiceId={invoice.id} />
          <details className="panel disclosure">
            <summary><AppIcon name="file-text" /><span>Edit invoice</span><AppIcon name="chevron-down" /></summary>
            <InvoiceForm workspace={workspace} invoice={invoice} />
          </details>
          <details className="panel disclosure">
            <summary><AppIcon name="users" /><span>Customer contact</span><AppIcon name="chevron-down" /></summary>
            <p className="muted">{customer.contact_name}</p>
            <CustomerForm workspace={workspace} customer={customer} />
          </details>
        </div>
      </section>
      <CashMovements workspace={workspace} movements={movements} selected={!!query.movement} />
      {query.movement && (
        <Link className="back-link" href={`/invoices/${invoice.id}#payment-history`}>
          Back to recent payments
        </Link>
      )}
      <RecordHistory
        invoiceId={invoice.id}
        {...history}
        cursor={query.history}
        members={workspace.members}
      />
    </WorkspaceShell>
  );
}
