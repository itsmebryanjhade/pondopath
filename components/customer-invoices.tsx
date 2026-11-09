import Link from "next/link";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { addDays } from "@/lib/domain/dates";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardIcon } from "./dashboard-icon";
import { RefreshRecords } from "./refresh-records";
import { ForecastCheckList } from "./forecast-check-list";
import { forecastChecks } from "@/lib/ui/forecast-checks";
import {
  collectionFilters,
  collectionFlags,
  type CollectionFilter,
} from "@/lib/domain/collection-status";

/** Plain names for the collection filters (the stored keys stay the same). */
const FILTER_LABELS: Record<CollectionFilter, string> = {
  all: "All", unpaid: "Unpaid", due: "Due today", overdue: "Overdue", commitment: "Customer promised",
  needs_review: "Needs a new date", no_expectation: "No payment date", no_followup: "No follow-up",
};

export function CustomerInvoices({ workspace, params }: {
  workspace: WorkspaceSnapshot;
  params: { page?: string | string[]; filter?: string | string[] };
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
  const forecast = calculateForecast(workspace.forecastInput);
  // The same plain checks as Overview and Forecast, limited to invoices: passed dates and money with no date.
  const invoiceChecks = forecastChecks(workspace, forecast, "invoices").filter((check) => check.key !== "overdue-bills");
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const days = forecast.days.slice(index * 7, index * 7 + 7);
    return { start: days[0].date, end: days.at(-1)!.date, cents: checkedSum(days.map((day) => day.expectedInCents)) };
  });
  const maxWeek = Math.max(1, ...weeks.map((week) => week.cents));
  // What customers owe, split by when it is due. Overdue and due-soon use original due dates.
  const later = unpaid.filter((invoice) => !flags.get(invoice.id)!.overdue && !dueSoon.includes(invoice));
  const owed = [
    { label: "Overdue", invoices: overdue, href: "/invoices?filter=overdue", tone: "late" },
    { label: "Due in the next 7 days", invoices: dueSoon, href: null, tone: "soon" },
    { label: "Due later", invoices: later, href: null, tone: "calm" },
  ];
  return (
    <WorkspaceShell workspace={workspace} className="section-page section-invoices invoices-page" header={
      <header className="section-heading">
        <div><p className="eyebrow">Receivables · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Customer invoices</h1><p>Keep original due dates, expected receipts and verified payments distinct.</p></div>
        <div className="dashboard-heading-actions">
          <span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span>
          <RefreshRecords />
          <Link className="section-primary" href="/add?type=invoice"><DashboardIcon name="plus" size={17} />Add an invoice</Link>
        </div>
      </header>
    }>
      <section className="section-lower-grid">
      <section className="records-panel invoice-list-card" aria-labelledby="invoice-list-heading">
        <div className="records-head">
          <div><h2 id="invoice-list-heading">Invoices <span className="next-count">{matching.length}</span></h2><p>Soonest due first. Amounts are what the customer still owes.</p></div>
        </div>
        {/* One tap per view: each filter is a link, so there is no separate Apply step. Empty views are hidden. */}
        <nav className="invoice-filters" aria-label="Show invoices">
          {(Object.keys(collectionFilters) as CollectionFilter[]).map((value) => {
            const count = value === "all" ? workspace.invoices.length : workspace.invoices.filter((invoice) => flags.get(invoice.id)![value]).length;
            if (value !== "all" && value !== filter && !count) return null;
            return <Link key={value} href={value === "all" ? "/invoices" : `/invoices?filter=${value}`} aria-current={filter === value ? "true" : undefined}>
              {FILTER_LABELS[value]}<span className="history-count">{count}</span>
            </Link>;
          })}
        </nav>
        {invoices.length ? (
          <ul className="invoice-list" aria-label="Customer invoices">
            {invoices.map((invoice) => {
              const today = workspace.forecastInput.referenceDate;
              const expectation = workspace.expectations.find((row) => row.invoice_id === invoice.id);
              const stale = !!expectation && (expectation.state === "needs_review" || expectation.expected_date < today);
              const next = nextFollowups.get(invoice.id);
              const paid = invoice.outstanding_cents === 0;
              const overdue = !paid && invoice.due_date < today;
              const unplanned = flags.get(invoice.id)!.unplannedCents;
              const customer = workspace.customers.find((row) => row.id === invoice.customer_id)?.name;
              const expected = paid ? "Fully received"
                : !expectation ? "No payment date yet"
                : stale ? `Expected ${formatPlanDate(expectation.expected_date, true)}, date passed · not counted`
                : expectation.kind === "commitment" ? `Customer promised ${formatPlanDate(expectation.expected_date, true)}`
                : `Expected ${formatPlanDate(expectation.expected_date, true)} (due date)`;
              return (
                <li key={invoice.id} className={`invoice-item${overdue ? " is-overdue" : ""}${paid ? " is-paid" : ""}`}>
                  <div className="invoice-who">
                    <Link className="invoice-number" href={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                    <span>{customer}</span>
                  </div>
                  <div className="invoice-due">
                    <span>{paid ? "Paid" : `Due ${formatPlanDate(invoice.due_date, true)}`}</span>
                    {overdue && <span className="status review">Overdue</span>}
                    {!paid && invoice.due_date === today && <span className="status">Due today</span>}
                  </div>
                  <div className="invoice-money">
                    <strong className="num">{formatPHP(invoice.outstanding_cents)}</strong>
                    {!paid && invoice.outstanding_cents !== invoice.amount_cents && <span>of {formatPHP(invoice.amount_cents)}</span>}
                    {paid && <span>{formatPHP(invoice.amount_cents)} received</span>}
                  </div>
                  <div className="invoice-plan">
                    <span className={stale || (!paid && !expectation) ? "is-warn" : undefined}>{expected}</span>
                    {!paid && unplanned > 0 && expectation && !stale && <span className="is-warn">{formatPHP(unplanned)} has no payment date</span>}
                    {!paid && <span className={next && next.due_date < today ? "negative" : undefined}>{next
                      ? `Next: ${next.next_action} · ${formatPlanDate(next.due_date, true)}`
                      : "No follow-up planned"}</span>}
                  </div>
                  {!paid && <Link className="row-action invoice-action" href={`/invoices/${invoice.id}?plan=edit#collection-plan`}>
                    {expectation ? "Update expected payment" : "Set expected payment"}
                  </Link>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">
            {workspace.invoices.length
              ? "No invoices match this filter."
              : <>No invoices yet. <Link href="/add?type=invoice">Add your first invoice</Link>.</>}
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
      <aside className={`forecast-checks-card invoice-checks ${invoiceChecks.length ? "is-caution" : "is-clear"}`} aria-labelledby="invoice-checks-heading">
        <div className="checks-card-head">
          <span className="checks-eyebrow"><DashboardIcon name={invoiceChecks.length ? "alert" : "check"} size={15} />{invoiceChecks.length ? "Check first" : "All clear"}</span>
          <h2 id="invoice-checks-heading">Invoices to fix</h2>
          <p>{invoiceChecks.length ? "These make the forecast less reliable." : "Every unpaid invoice has a current payment date."}</p>
        </div>
        <div className="forecast-checks-body"><ForecastCheckList checks={invoiceChecks} empty="No passed payment dates and no money without a date." /></div>
      </aside>
      </section>


      <section className="section-feature owed-panel" aria-label="Money owed and when it is expected">
        <div className="section-feature-copy owed-summary">
          <span>Money customers owe you</span><strong className="num">{formatPHP(checkedSum(unpaid.map((invoice) => invoice.outstanding_cents)))}</strong>
          <p>{unpaid.length} unpaid {unpaid.length === 1 ? "invoice" : "invoices"} · owed, not cash yet</p>
          <ul className="owed-breakdown" aria-label="Owed by due date">
            {owed.map((row) => <li key={row.label} className={`is-${row.tone}`}>
              {(() => {
                const inner = <><span>{row.label}<small>{row.invoices.length} {row.invoices.length === 1 ? "invoice" : "invoices"}</small></span>
                  <strong className="num">{formatPHP(checkedSum(row.invoices.map((invoice) => invoice.outstanding_cents)))}</strong></>;
                // Only overdue has its own filter; the other rows are figures, not links to the wrong list.
                return row.href && row.invoices.length ? <Link href={row.href}>{inner}</Link> : <div>{inner}</div>;
              })()}
            </li>)}
          </ul>
        </div>
        <div className="mini-chart" role="region" aria-labelledby="collection-outlook-title">
          <div className="mini-chart-head"><div><strong id="collection-outlook-title">When customers are expected to pay</strong><span>By week · {formatPlanDate(forecast.days[0].date, true)}–{formatPlanDate(forecast.days[29].date, true)}</span></div><span className="mini-chart-change">30 days</span></div>
          <div className="bars invoice-bars" aria-label="Expected receipts grouped into seven-day periods">
            {weeks.map((week) => <button type="button" key={week.start} data-cents={week.cents}
              aria-label={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)} expected`}
              data-tooltip={`${formatPlanDate(week.start, true)}–${formatPlanDate(week.end, true)}: ${formatPHP(week.cents)}`}>
              <span aria-hidden="true" style={{ height: `${week.cents / maxWeek * 100}%` }} />
            </button>)}
          </div>
          <div className="bar-dates invoice-week-labels" aria-hidden="true">{weeks.map((week) => <span key={week.start}>{formatPlanDate(week.start, true)}<small>{formatPHP(week.cents)}</small></span>)}</div>
          <p className="invoice-chart-note">Expected receipts are not available cash. Invoices with a passed or missing date aren&rsquo;t counted.</p>
        </div>
      </section>

    </WorkspaceShell>
  );
}
