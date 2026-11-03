import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { addDays } from "@/lib/domain/dates";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "./dashboard-icon";
import { RefreshRecords } from "./refresh-records";
import {
  collectionFilters,
  collectionFlags,
  type CollectionFilter,
} from "@/lib/domain/collection-status";

export function CustomerInvoices({ workspace, params, invoiceControls, customerControls }: {
  workspace: WorkspaceSnapshot;
  params: { page?: string | string[]; filter?: string | string[] };
  invoiceControls: ReactNode;
  customerControls: ReactNode;
}) {
  const requestedPage =
    typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const filter: CollectionFilter =
    typeof params.filter === "string" && Object.hasOwn(collectionFilters, params.filter)
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
  const unpaid = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0);
  const dueSoon = unpaid.filter((invoice) => invoice.due_date >= workspace.forecastInput.referenceDate && invoice.due_date <= addDays(workspace.forecastInput.referenceDate, 6));
  const overdue = unpaid.filter((invoice) => flags.get(invoice.id)!.overdue);
  const missingExpectation = unpaid.filter((invoice) => flags.get(invoice.id)!.no_expectation);
  const forecast = calculateForecast(workspace.forecastInput);
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const days = forecast.days.slice(index * 7, index * 7 + 7);
    return { start: days[0].date, end: days.at(-1)!.date, cents: checkedSum(days.map((day) => day.expectedInCents)) };
  });
  const maxWeek = Math.max(1, ...weeks.map((week) => week.cents));
  const metrics = [
    { label: "Due in the next 7 days", value: formatPHP(checkedSum(dueSoon.map((invoice) => invoice.outstanding_cents))), note: `${dueSoon.length} unpaid invoices · original due dates`, tone: "blue" },
    { label: "Overdue balance", value: formatPHP(checkedSum(overdue.map((invoice) => invoice.outstanding_cents))), note: `${overdue.length} unpaid invoices need attention`, tone: "orange" },
    { label: "No current expectation", value: String(missingExpectation.length), note: "Unpaid invoices without a receipt plan", tone: "green" },
  ];
  return (
    <WorkspaceShell workspace={workspace} className="section-page section-invoices invoices-page" header={
      <header className="section-heading">
        <div><p className="eyebrow">Receivables · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Customer invoices</h1><p>Keep original due dates, expected receipts and verified payments distinct.</p></div>
        <div className="dashboard-heading-actions">
          <span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span>
          <RefreshRecords />
          <Link className="button secondary" href="/imports">Import &amp; review</Link>
          <Link className="button secondary" href="/followups">Follow-ups</Link>
          <Link className="section-primary" href="#new-invoice"><DashboardIcon name="plus" size={17} />Add an invoice</Link>
        </div>
      </header>
    }>
      <section className="section-lower-grid">
      <section className="records-panel">
        <div className="records-head">
          <div><h2>{matching.length} of {workspace.invoices.length} invoices</h2><p>Saved records · original due dates and remaining balances</p></div>
          <span className="muted">PHP</span>
        </div>
        <form method="get" action="/invoices" className="collection-filter">
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
            <table className="invoice-table">
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
                        <Link className="invoice-number" href={`/invoices/${invoice.id}`}><DashboardIcon name="receipt" size={16} />{invoice.number}</Link>
                        <p className="muted">
                          {workspace.customers.find((row) => row.id === invoice.customer_id)?.name}
                        </p>
                        {invoice.outstanding_cents > 0 && <Link className="text-link" href={`/invoices/${invoice.id}?plan=edit#collection-plan`}>{expectation ? "Update expected payment" : "Set expected payment"}</Link>}
                      </th>
                      <td>
                        {invoice.due_date}
                        {invoice.outstanding_cents > 0 &&
                          invoice.due_date < workspace.forecastInput.referenceDate && (
                            <p className="status review">Overdue</p>
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
                          <Link className="invoice-expectation" href={`/invoices/${invoice.id}?plan=edit#collection-plan`}>
                            <span className={`status${stale ? " review" : ""}`}>
                              {stale
                                ? "Needs review · Excluded"
                                : expectation.kind === "commitment"
                                  ? "Customer commitment"
                                  : "Due-date assumption"}
                            </span>
                            <span className="cell-sub">
                              {formatPHP(expectation.remaining_cents)} · {expectation.expected_date}
                            </span>
                            <span className="invoice-review-label">Review source and plan</span>
                          </Link>
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
          <nav className="table-foot" aria-label="Invoice pages">
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
      <aside className="section-ai-card">
        <span><DashboardIcon name="sparkle" size={15} />Collection check</span>
        <h2>Review before relying on receipts</h2>
        <p>{forecast.incompleteInvoiceIds.length} unpaid invoices have an incomplete or unconfirmed receipt plan. Review missing dates, stale expectations and unplanned partial balances.</p>
        <Link className="invoice-source-link" href="/forecast">Review the cash plan <DashboardIcon name="arrowRight" size={15} /></Link>
        <div className="source-note"><span>Based on</span><strong>Saved invoice records</strong></div>
      </aside>
      </section>

      <section className="section-metrics" aria-label="Collection summary">
        {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}>
          <span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className="num">{value}</strong><small>{note}</small>
        </article>)}
      </section>

      <section className="section-feature" aria-label="Outstanding invoices and collection outlook">
        <div className="section-feature-copy">
          <span>Total outstanding</span><strong className="num">{formatPHP(checkedSum(unpaid.map((invoice) => invoice.outstanding_cents)))}</strong>
          <p>{unpaid.length} unpaid invoices · money owed, not received cash</p>
          <Link className="invoice-source-link" href="/invoices?filter=unpaid">Review unpaid invoices <DashboardIcon name="arrowRight" size={15} /></Link>
        </div>
        <div className="mini-chart" role="region" aria-labelledby="collection-outlook-title">
          <div className="mini-chart-head"><div><strong id="collection-outlook-title">Collection outlook</strong><span>Expected invoice receipts · {formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(forecast.days[29].date, true)}</span></div><span className="mini-chart-change">30 days</span></div>
          <div className="bars invoice-bars" aria-label="Expected receipts grouped into seven-day periods">
            {weeks.map((week) => <button type="button" key={week.start} data-cents={week.cents}
              aria-label={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)} expected`}
              data-tooltip={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)}`}>
              <span aria-hidden="true" style={{ height: `${week.cents / maxWeek * 100}%` }} />
            </button>)}
          </div>
          <div className="bar-dates invoice-week-labels" aria-hidden="true">{weeks.map((week) => <span key={week.start}>{formatPlanDate(week.start, true)}<small>{formatPHP(week.cents)}</small></span>)}</div>
          <p className="invoice-chart-note">Expected receipts are not available cash. Stale or review-needed amounts are excluded; unplanned balances are not assumed.</p>
        </div>
      </section>

      <div className="two-column invoice-forms">
        <section id="new-invoice" className="records-panel">
          <div className="records-head"><div><h2>Add an unpaid invoice</h2><p>Record what remains unpaid at the opening cutoff</p></div><DashboardIcon name="receipt" size={18} /></div>
          <div className="invoice-form-body">
          {workspace.customers.length ? (
            invoiceControls
          ) : (
            <p className="empty-state">Create a customer first using the adjacent form.</p>
          )}
          </div>
        </section>
        <section className="records-panel">
          <div className="records-head"><div><h2>Add a customer</h2><p>Keep contact details with their invoices</p></div><DashboardIcon name="plus" size={18} /></div>
          <div className="invoice-form-body">{customerControls}</div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
