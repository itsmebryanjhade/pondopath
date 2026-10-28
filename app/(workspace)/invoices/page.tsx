import Link from "next/link";
import { Suspense } from "react";
import WorkspaceLoading from "../loading";
import { getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { CustomerForm, InvoiceForm } from "@/components/record-forms";
import {
  collectionFilters,
  collectionFlags,
  type CollectionFilter,
} from "@/lib/domain/collection-status";

type InvoicePageProps = { searchParams: Promise<{ page?: string; filter?: string }> };

export default function Invoices(props: InvoicePageProps) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <InvoicesContent {...props} />
    </Suspense>
  );
}

async function InvoicesContent({ searchParams }: InvoicePageProps) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  const requestedPage =
    typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const filter: CollectionFilter =
    params.filter && Object.hasOwn(collectionFilters, params.filter)
      ? (params.filter as CollectionFilter)
      : "all";
  const nextFollowups = new Map(
    workspace.invoices.map((invoice) => [
      invoice.id,
      workspace.followups
        .filter((row) => row.invoice_id === invoice.id && row.state === "open")
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))[0],
    ]),
  );
  const flags = new Map(
    workspace.forecastInput.invoices.map((invoice) => [
      invoice.id,
      collectionFlags(
        {
          ...invoice,
          dueDate: workspace.invoices.find((row) => row.id === invoice.id)!.due_date,
          hasOpenFollowup: !!nextFollowups.get(invoice.id),
        },
        workspace.forecastInput.referenceDate,
      ),
    ]),
  );
  const matching = workspace.invoices.filter(
    (invoice) => filter === "all" || flags.get(invoice.id)![filter],
  );
  const pages = Math.max(1, Math.ceil(matching.length / 50));
  const page = Math.min(requestedPage, pages);
  const invoices = [...matching]
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
    .slice((page - 1) * 50, page * 50);
  return (
    <WorkspaceShell workspace={workspace} header={<WorkspacePageHeading workspace={workspace} title="Customer invoices" description="Keep original due dates, expected receipts and verified payments distinct." actions={<Link className="button" href="#new-invoice">Add an invoice</Link>} />}>
      <section className="panel">
        <div className="section-heading">
          <h2>
            {matching.length} of {workspace.invoices.length} invoices
          </h2>
          <span className="muted">PHP</span>
        </div>
        <form method="get" className="collection-filter">
          <label className="form-field">
            <span>Collection view</span>
            <select className="field" name="filter" defaultValue={filter}>
              {Object.entries(collectionFilters).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" type="submit">
            Apply filter
          </button>
        </form>
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
                  <th scope="col">Next follow-up</th>
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
                  const next = nextFollowups.get(invoice.id);
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
                      <td className="num">
                        {formatPHP(invoice.outstanding_cents)}
                        {flags.get(invoice.id)!.unplannedCents > 0 && (
                          <p className="muted">
                            {formatPHP(flags.get(invoice.id)!.unplannedCents)} unplanned
                          </p>
                        )}
                      </td>
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
                            <Link href={`/invoices/${invoice.id}#collection-plan`}>
                              Review source and plan
                            </Link>
                          </>
                        ) : (
                          "No current expectation"
                        )}
                      </td>
                      <td>
                        {next ? (
                          <>
                            <Link href={`/invoices/${invoice.id}#followup-${next.id}`}>
                              {next.next_action}
                            </Link>
                            <p
                              className={
                                next.due_date < workspace.forecastInput.referenceDate
                                  ? "negative"
                                  : "muted"
                              }
                            >
                              {next.due_date} ·{" "}
                              {workspace.members.find(
                                (member) => member.user_id === next.assignee_id,
                              )?.display_name ?? "Previous team member"}
                            </p>
                          </>
                        ) : invoice.outstanding_cents > 0 ? (
                          "No next follow-up"
                        ) : (
                          "Fully received"
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
            {workspace.invoices.length
              ? "No invoices match this collection view."
              : "No invoices yet. Add a customer, then an invoice that remains unpaid at the opening cutoff."}
          </p>
        )}
        {matching.length > 50 && (
          <nav className="pagination" aria-label="Invoice pages">
            <span>
              {(page - 1) * 50 + 1}–{Math.min(page * 50, matching.length)} of {matching.length}
            </span>
            {page > 1 && (
              <Link href={`/invoices?filter=${filter}&page=${page - 1}`}>Previous 50</Link>
            )}
            {page < pages && (
              <Link href={`/invoices?filter=${filter}&page=${page + 1}`}>Next 50</Link>
            )}
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
