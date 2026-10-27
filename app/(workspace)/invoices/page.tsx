import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CustomerForm, InvoiceForm } from "@/components/record-forms";

export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  const requestedPage =
    typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const pages = Math.max(1, Math.ceil(workspace.invoices.length / 50));
  const page = Math.min(requestedPage, pages);
  const invoices = [...workspace.invoices]
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
    .slice((page - 1) * 50, page * 50);
  return (
    <WorkspaceShell workspace={workspace} active="/invoices">
      <div className="page-heading">
        <div>
          <h1>Customer invoices</h1>
          <p className="muted">
            Keep the original due date, expected receipt and verified payment distinct.
          </p>
        </div>
        <a className="button" href="#new-invoice">
          Add an invoice
        </a>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            {workspace.invoices.length} {workspace.invoices.length === 1 ? "invoice" : "invoices"}
          </h2>
          <span className="muted">PHP</span>
        </div>
        {invoices.length ? (
          <div className="table-scroll" role="region" aria-label="Customer invoices" tabIndex={0}>
            <table>
              <caption className="sr-only">Invoices and unpaid balances</caption>
              <thead>
                <tr>
                  <th scope="col">Invoice / customer</th>
                  <th scope="col">Original due date</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Outstanding
                  </th>
                  <th scope="col">Current expectation</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const expectation = workspace.expectations.find(
                    (row) => row.invoice_id === invoice.id,
                  );
                  const stale =
                    expectation &&
                    (expectation.state === "needs_review" ||
                      expectation.expected_date < workspace.forecastInput.referenceDate);
                  return (
                    <tr key={invoice.id}>
                      <th scope="row">
                        <Link href={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                        <p className="muted">
                          {workspace.customers.find((row) => row.id === invoice.customer_id)?.name}
                        </p>
                      </th>
                      <td>
                        {invoice.due_date}
                        {invoice.outstanding_cents > 0 &&
                          invoice.due_date < workspace.forecastInput.referenceDate && (
                            <p className="negative">Overdue</p>
                          )}
                      </td>
                      <td className="num">{formatPHP(invoice.amount_cents)}</td>
                      <td className="num">{formatPHP(invoice.outstanding_cents)}</td>
                      <td>
                        {invoice.outstanding_cents === 0 ? (
                          "Fully received"
                        ) : expectation ? (
                          <>
                            <span>
                              {stale
                                ? "Needs review · Excluded"
                                : expectation.kind === "commitment"
                                  ? "Customer commitment"
                                  : "Due-date assumption"}
                            </span>
                            <p className="muted">
                              {formatPHP(expectation.remaining_cents)} · {expectation.expected_date}
                            </p>
                          </>
                        ) : (
                          "No current expectation"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No invoices yet. Add a customer, then an invoice that remains unpaid at the opening
            cutoff.
          </p>
        )}
        {workspace.invoices.length > 50 && (
          <nav className="pagination" aria-label="Invoice pages">
            <span>
              {(page - 1) * 50 + 1}–{Math.min(page * 50, workspace.invoices.length)} of{" "}
              {workspace.invoices.length}
            </span>
            {page > 1 && <Link href={`/invoices?page=${page - 1}`}>Previous 50</Link>}
            {page < pages && <Link href={`/invoices?page=${page + 1}`}>Next 50</Link>}
          </nav>
        )}
      </section>
      <div className="two-column form-panels">
        <section id="new-invoice" className="panel">
          <h2>Add an unpaid invoice</h2>
          {workspace.customers.length ? (
            <InvoiceForm workspace={workspace} />
          ) : (
            <p className="empty-state">Create a customer first using the adjacent form.</p>
          )}
        </section>
        <section className="panel">
          <h2>Add a customer</h2>
          <CustomerForm workspace={workspace} />
        </section>
      </div>
    </WorkspaceShell>
  );
}
