import Link from "next/link";
import { Suspense } from "react";
import WorkspaceLoading from "../../loading";
import { notFound } from "next/navigation";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InvoiceForm, CustomerForm } from "@/components/record-forms";
import { PaymentForm } from "@/components/payment-form";
import { CashMovements } from "@/components/cash-movements";

type InvoiceDetailProps = { params: Promise<{ id: string }> };

export default function InvoiceDetail(props: InvoiceDetailProps) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <InvoiceDetailContent {...props} />
    </Suspense>
  );
}

async function InvoiceDetailContent({ params }: InvoiceDetailProps) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const invoice = workspace.invoices.find((row) => row.id === id);
  if (!invoice) notFound();
  const customer = workspace.customers.find((row) => row.id === invoice.customer_id)!;
  const expectation = workspace.expectations.find((row) => row.invoice_id === invoice.id);
  const movements = await getCashMovements("receipt", workspace.revision, invoice.id);
  return (
    <WorkspaceShell workspace={workspace} active="/invoices">
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
        <section className="panel">
          <h2>Current cash-plan expectation</h2>
          {expectation ? (
            <>
              <p className="expectation-amount num">{formatPHP(expectation.remaining_cents)}</p>
              <p>
                Expected {expectation.expected_date} ·{" "}
                {expectation.kind === "commitment"
                  ? "Customer-confirmed commitment"
                  : "Due-date assumption"}
              </p>
              <p className="muted">
                {expectation.state === "needs_review" ||
                expectation.expected_date < workspace.forecastInput.referenceDate
                  ? "Needs review. Excluded from projected inflows."
                  : "Included only if its date falls within the 30-day forecast."}
              </p>
              <blockquote>{expectation.source_note}</blockquote>
            </>
          ) : (
            <p className="empty-state">
              No current expectation. Unplanned unpaid money is excluded from the forecast.
            </p>
          )}
          <p className="muted">
            A promise changes the cash plan; it never changes actual cash. Review the source, date
            and remaining amount before relying on expected cash.
          </p>
        </section>
      </div>
      <CashMovements workspace={workspace} movements={movements} />
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
    </WorkspaceShell>
  );
}
