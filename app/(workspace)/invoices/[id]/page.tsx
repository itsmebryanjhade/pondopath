import Link from "next/link";
import { notFound } from "next/navigation";
import { getCashMovements, getRecordHistory, getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { AppIcon } from "@/components/app-icon";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InvoiceForm, CustomerForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { RecordPaymentToggle } from "@/components/record-payment-toggle";
import { InvoicePayments } from "@/components/invoice-payments";
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
  searchParams: Promise<{ history?: string; movement?: string; plan?: string; from?: string | string[] }>;
};

const invoiceOrigins = new Map([
  ["forecast", { href: "/forecast", label: "Back to forecast" }],
  ["followups", { href: "/followups", label: "Back to follow-ups" }],
  ["overview", { href: "/overview#cash-activity", label: "Back to overview" }],
  ["review", { href: "/imports?state=resolved", label: "Back to review" }],
]);

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
  const today = workspace.forecastInput.referenceDate;
  const daysFromDue = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoice.due_date}T00:00:00Z`)) / 86_400_000);
  const status = paid ? "Paid" : overdue ? "Overdue" : daysFromDue === 0 ? "Due today" : "Unpaid";
  // How the due date relates to today, in words: what someone opening the invoice wants to know first.
  const timing = paid ? "Paid in full"
    : daysFromDue > 0 ? `${daysFromDue} ${daysFromDue === 1 ? "day" : "days"} late`
    : daysFromDue === 0 ? "Due today"
    : `Due in ${-daysFromDue} ${daysFromDue === -1 ? "day" : "days"}`;
  const origin = typeof query.from === "string" ? invoiceOrigins.get(query.from) : undefined;
  return (
    <WorkspaceShell workspace={workspace} className="invoice-detail-page" header={
      <header className="invoice-detail-header">
        <Link className="back-link invoice-back" href={origin?.href ?? "/invoices"}>
          ← {origin?.label ?? "All invoices"}
        </Link>
        <div className="invoice-identity">
          <div className="invoice-title">
            <h1>{invoice.number}</h1>
            <span className={`invoice-state${paid ? " is-paid" : overdue ? " is-overdue" : ""}`}>{status}</span>
          </div>
          <p className="invoice-subline">
            <span>{customer.name}</span>
            <span>Due <time dateTime={invoice.due_date}>{formatPlanDate(invoice.due_date)}</time></span>
            <span className={overdue ? "is-late" : undefined}>{timing}</span>
          </p>
        </div>
        {/* Phones and tablets have no date in the top bar, so the plan date shows here only there. */}
        <p className="muted invoice-plan-asof">Plan as of <time dateTime={today}>{formatPlanDate(today)}</time></p>
      </header>
    }>
      <section className={`panel invoice-balance${paid ? " is-paid" : ""}`} aria-label="Invoice balance">
        {/* Still owed first; received and total become one progress line under it. */}
        <div className="balance-main">
          <span className="balance-label">{paid ? "Paid in full" : "Still owed"}</span>
          <strong className="num">{formatPHP(paid ? invoice.amount_cents : invoice.outstanding_cents)}</strong>
          <div className="balance-bar" role="img" aria-label={`${formatPHP(invoice.paid_cents)} received of ${formatPHP(invoice.amount_cents)}`}>
            <span style={{ width: `${invoice.amount_cents ? Math.min(100, Math.round((invoice.paid_cents / invoice.amount_cents) * 100)) : 0}%` }} />
          </div>
          <p><strong className="num">{formatPHP(invoice.paid_cents)}</strong> received of <strong className="num">{formatPHP(invoice.amount_cents)}</strong></p>
        </div>
        <AiContextButton entry={{
          context: { page: "invoices", record: { kind: "invoice", id: invoice.id } },
          workspace, starterText: "Explain this outstanding balance",
        }}>Explain this balance</AiContextButton>
        {!paid && <p className="balance-hint">Only after the money is in your account.</p>}
        {!paid && (
          <RecordPaymentToggle>
            <PaymentForm
              workspace={workspace}
              kind="receipt"
              parentId={invoice.id}
              remainingCents={invoice.outstanding_cents}
              showRemaining={false}
            />
          </RecordPaymentToggle>
        )}
      </section>
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
            <summary><AppIcon name="edit-3" /><span className="action-text"><span>Edit invoice</span><small>{movements.length > 0 ? "Correct the total or due date. Owner only, with a reason." : "Fix the invoice number, customer, total or due date."}</small></span><AppIcon name="chevron-down" /></summary>
            <InvoiceForm workspace={workspace} invoice={invoice} locked={movements.length > 0} />
          </details>
          <details className="panel disclosure">
            <summary><AppIcon name="users" /><span className="action-text"><span>Customer contact</span><small>{[customer.contact_name, customer.email || customer.phone].filter(Boolean).join(" · ") || "Who to contact about payment"}</small></span><AppIcon name="chevron-down" /></summary>
            <CustomerForm workspace={workspace} customer={customer} />
          </details>
        </div>
      </section>
      <InvoicePayments workspace={workspace} movements={movements} selected={!!query.movement} />
      {query.movement && (
        <Link className="back-link" href={`/invoices/${invoice.id}#payment-history`}>
          Show all payments
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
