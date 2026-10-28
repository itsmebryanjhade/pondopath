import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { FollowupPanel } from "@/components/followup-panel";
import { DashboardIcon } from "@/components/dashboard-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  const open = workspace.followups.filter((task) => task.state === "open");
  const overdue = open.filter((task) => task.due_date < workspace.forecastInput.referenceDate);
  const dueByInvoice = new Map<string, string>();
  for (const task of [...workspace.followups].sort((a, b) => a.due_date.localeCompare(b.due_date))) if (!dueByInvoice.has(task.invoice_id)) dueByInvoice.set(task.invoice_id, task.due_date);
  const invoices = workspace.invoices.filter((invoice) => dueByInvoice.has(invoice.id)).sort((a, b) => dueByInvoice.get(a.id)!.localeCompare(dueByInvoice.get(b.id)!) || a.id.localeCompare(b.id));
  const requestedPage = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const pages = Math.max(1, Math.ceil(invoices.length / 20));
  const page = Math.min(requestedPage, pages);
  const openInvoiceIds = new Set(open.map((task) => task.invoice_id));
  const tiedBalance = checkedSum(workspace.invoices.filter((invoice) => openInvoiceIds.has(invoice.id)).map((invoice) => invoice.outstanding_cents));
  const schedule = [
    { label: "Overdue", count: overdue.length },
    { label: "Due today", count: open.filter((task) => task.due_date === workspace.forecastInput.referenceDate).length },
    { label: "Upcoming", count: open.filter((task) => task.due_date > workspace.forecastInput.referenceDate).length },
  ];
  const chartMaximum = Math.max(1, ...schedule.map((group) => group.count));
  const metrics = [
    { label: "Open actions", count: open.length, note: "All saved unresolved tasks", tone: "orange" },
    { label: "Overdue actions", count: overdue.length, note: "Before the reference date", tone: "blue" },
    { label: "Completed actions", count: workspace.followups.filter((task) => task.state === "completed").length, note: "Retained completion history", tone: "green" },
  ];
  return <WorkspaceShell workspace={workspace} className="section-page section-follow-ups followups-page" header={
    <header className="section-heading">
      <div><p className="eyebrow">Action center · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Follow-ups</h1><p>Keep the next collection action, owner and due date visible.</p></div>
      <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords /><Link className="section-primary" href="/invoices?filter=no_followup"><DashboardIcon name="plus" size={17} />Find invoices without a follow-up</Link></div>
    </header>
  }>
    <section className="section-lower-grid">
      <section className="records-panel">
        <div className="records-head"><div><h2>Follow-up queue and history</h2><p>Expand an invoice to review its actions, assignment and outcomes</p></div><span>{invoices.length} invoices</span></div>
        {invoices.length ? <div className="followup-list-scroll" role="region" aria-label="Invoice follow-up records" tabIndex={0}>
          <div className="record-list followup-worklist">{invoices.slice((page - 1) * 20, page * 20).map((invoice) => {
            const count = open.filter((task) => task.invoice_id === invoice.id).length;
            return <details className="records-panel followup-invoice-card" key={invoice.id}>
              <summary className="record-row">
                <span className="record-icon" aria-hidden="true"><DashboardIcon name="bell" size={16} /></span>
                <div><strong>{invoice.number}</strong><span>{workspace.customers.find((customer) => customer.id === invoice.customer_id)?.name ?? "Customer unavailable"}</span></div>
                <strong className="record-amount num">{formatPHP(invoice.outstanding_cents)}</strong><span className={`record-status${count ? " status-1" : ""}`}>{count} open</span><span className="followup-toggle" aria-hidden="true"><DashboardIcon name="chevron" size={16} /></span>
              </summary>
              <div className="followup-invoice-body"><Link className="text-link" href={`/invoices/${invoice.id}`}>Review source invoice →</Link><FollowupPanel workspace={workspace} invoice={invoice} /></div>
            </details>;
          })}</div>
        </div> : <p className="empty-state">No follow-up tasks entered. Open an unpaid invoice to schedule its next action.</p>}
        {pages > 1 && <nav className="table-foot" aria-label="Follow-up pages"><span>Page {page} of {pages}</span>{page > 1 && <Link href={`/followups?page=${page - 1}`}>Previous</Link>}{page < pages && <Link href={`/followups?page=${page + 1}`}>Next</Link>}</nav>}
      </section>
      <aside className="section-ai-card" role={workspace.automation.stale ? "status" : undefined}>
        <span><DashboardIcon name="bell" size={15} />Follow-up checks</span>
        <p>{workspace.automation.stale ? "Automatic follow-up checks are not current. Review unresolved customer commitments and existing open tasks before following up again." : "Review the source invoice before contacting a customer. Completing a follow-up does not confirm that money was received."}</p>
        <Link className="followup-source-link" href="/invoices?filter=commitment">Review commitments <DashboardIcon name="arrowRight" size={15} /></Link>
      </aside>
    </section>
    <section className="section-metrics" aria-label="Follow-up summary">
      {metrics.map(({ label, count, note, tone }) => <article className="section-metric" key={label}><span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className="num">{count}</strong><small>{note}</small></article>)}
    </section>
    <section className="section-feature" aria-label="Follow-up analytics">
      <div className="section-feature-copy">
        <span>Amount tied to open follow-ups</span><strong className="num">{formatPHP(tiedBalance)}</strong>
        <p>Unpaid balances on invoices with open tasks. Each invoice is counted once; this is not expected or received cash.</p>
        <Link className="followup-source-link" href="/invoices?filter=unpaid">Review unpaid invoices <DashboardIcon name="arrowRight" size={15} /></Link>
      </div>
      <div className="mini-chart" role="region" aria-labelledby="followup-analytics-title">
        <div className="mini-chart-head"><div><strong id="followup-analytics-title">Open action schedule</strong><span>Task due dates as of {formatPlanDate(workspace.forecastInput.referenceDate)}</span></div><span className="mini-chart-change">Actions</span></div>
        <div className="bars followup-bars" aria-label="Open tasks by due-date group">
          {schedule.map((group) => <button type="button" key={group.label} data-count={group.count} aria-label={`${group.label}: ${group.count} open actions`} data-tooltip={`${group.label}: ${group.count} open actions`}><span aria-hidden="true" style={{ height: `${group.count / chartMaximum * 100}%` }} /></button>)}
        </div>
        <div className="bar-dates followup-bar-labels" aria-hidden="true">{schedule.map((group) => <span key={group.label}>{group.label}<strong>{group.count}</strong></span>)}</div>
        <p className="followup-chart-note">Only open tasks are included. Completed actions remain available in the invoice history.</p>
      </div>
    </section>
  </WorkspaceShell>;
}
