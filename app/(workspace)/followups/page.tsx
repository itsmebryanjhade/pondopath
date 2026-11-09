import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { FollowupPanel } from "@/components/followup-panel";
import { NextActions } from "@/components/next-actions";
import { DashboardIcon } from "@/components/dashboard-icon";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { followupDue } from "@/lib/display";
import { AutomationCheck } from "@/components/automation-check";
import { AiContextButton } from "@/components/ai-context-button";

const checkTime = (value?: string | null) => value ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) + " PHT" : "Never";

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  const open = workspace.followups.filter((task) => task.state === "open");
  const overdue = open.filter((task) => task.due_date < workspace.forecastInput.referenceDate);
  // Most urgent first: the earliest open task; invoices with only finished tasks sort after them.
  const dueByInvoice = new Map<string, string>();
  for (const task of [...workspace.followups].sort((a, b) => Number(a.state !== "open") - Number(b.state !== "open") || a.due_date.localeCompare(b.due_date))) if (!dueByInvoice.has(task.invoice_id)) dueByInvoice.set(task.invoice_id, (task.state === "open" ? "0" : "1") + task.due_date);
  const invoices = workspace.invoices.filter((invoice) => dueByInvoice.has(invoice.id)).sort((a, b) => dueByInvoice.get(a.id)!.localeCompare(dueByInvoice.get(b.id)!) || a.id.localeCompare(b.id));
  const requestedPage = typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page) ? Number(params.page) : 1;
  const pages = Math.max(1, Math.ceil(invoices.length / 20));
  const page = Math.min(requestedPage, pages);
  const openInvoiceIds = new Set(open.map((task) => task.invoice_id));
  const tiedBalance = checkedSum(workspace.invoices.filter((invoice) => openInvoiceIds.has(invoice.id)).map((invoice) => invoice.outstanding_cents));
  const today = workspace.forecastInput.referenceDate;
  const counts = [
    { key: "late", label: "Overdue", count: overdue.length },
    { key: "today", label: "Due today", count: open.filter((task) => task.due_date === today).length },
    { key: "later", label: "Coming up", count: open.filter((task) => task.due_date > today).length },
  ];
  const done = workspace.followups.filter((task) => task.state === "completed").length;
  const automation = workspace.automation;
  const firstOpenInvoice = invoices.find((invoice) => open.some((task) => task.invoice_id === invoice.id && invoice.outstanding_cents > 0));
  return <WorkspaceShell workspace={workspace} className="section-page section-follow-ups followups-page" header={
    <WorkspacePageHeading title="Follow-ups" description="Every collection task, who has it and when it’s due." workspace={workspace}
      actions={<Link className="button" href="/invoices?filter=no_followup"><DashboardIcon name="plus" size={17} />Find invoices without a follow-up</Link>} />
  }>
    <NextActions workspace={workspace} origin="followups" showFollowupAssistant />
    <section className="section-lower-grid">
      <section className="records-panel followup-queue" id="followup-queue" aria-labelledby="followup-queue-heading">
        <div className="records-head">
          <div><h2 id="followup-queue-heading">All follow-ups</h2><p>Every invoice with a follow-up, most urgent first. Open one to record what happened.</p></div>
          <span>{invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}</span>
          {firstOpenInvoice && (
            <AiContextButton entry={{
              context: { page: "followups", record: { kind: "invoice", id: firstOpenInvoice.id } },
              workspace, starterText: "Help me follow up on this invoice",
              intent: "draft_followup",
            }}>Help me follow up</AiContextButton>
          )}
        </div>
        {invoices.length ? <ul className="followup-queue-list">{invoices.slice((page - 1) * 20, page * 20).map((invoice) => {
          const tasks = open.filter((task) => task.invoice_id === invoice.id).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
          const first = tasks[0];
          const due = first ? followupDue(first.due_date, workspace.forecastInput.referenceDate) : null;
          const customer = workspace.customers.find((row) => row.id === invoice.customer_id)?.name ?? "Customer unavailable";
          return <li key={invoice.id} className={`followup-queue-item is-${due?.tone ?? "done"}`}>
            <details className="followup-invoice-card">
              <summary>
                <span className="followup-queue-main">
                  <span className="followup-queue-meta"><span className={`next-chip due-${due ? (due.tone === "late" ? "late" : due.tone === "today" ? "soon" : "calm") : "calm"}`}>{due ? due.text : "Nothing open"}</span>{tasks.length > 1 && <span className="next-chip">+{tasks.length - 1} more</span>}</span>
                  <strong>{first ? first.next_action : "All follow-ups done"}</strong>
                  <small>{invoice.number} · {customer} · <span className="num">{formatPHP(invoice.outstanding_cents)}</span> {invoice.outstanding_cents > 0 ? "owed" : "paid in full"}</small>
                </span>
                <span className="followup-queue-toggle"><span className="when-closed">{first ? "Open" : "History"}</span><span className="when-open">Close</span><DashboardIcon name="chevron" size={16} /></span>
              </summary>
              <div className="followup-invoice-body">
                <FollowupPanel workspace={workspace} invoice={invoice} hideHeading />
                <Link className="text-link followup-queue-link" href={`/invoices/${invoice.id}?from=followups`}>Open the invoice <DashboardIcon name="arrowRight" size={14} /></Link>
              </div>
            </details>
          </li>;
        })}</ul> : <p className="empty-state">No follow-up tasks entered. Open an unpaid invoice to schedule its next action.</p>}
        {pages > 1 && <nav className="table-foot" aria-label="Follow-up pages"><span>Page {page} of {pages}</span>{page > 1 && <Link href={`/followups?page=${page - 1}`}>Previous</Link>}{page < pages && <Link href={`/followups?page=${page + 1}`}>Next</Link>}</nav>}
      </section>
      <aside className={`followup-checks${automation.stale ? " is-paused" : ""}`} role={automation.stale ? "status" : undefined} aria-labelledby="followup-checks-heading">
        <div className="followup-checks-copy">
          <h2 id="followup-checks-heading"><DashboardIcon name="bell" size={15} />{automation.stale ? "Automatic checks are paused" : "Automatic checks are on"}</h2>
          <p>{automation.stale
            ? "Every 15 minutes PondoPath looks for late invoices and passed payment promises, but the last automatic check didn’t run. Press Check now to run it yourself."
            : "Every 15 minutes PondoPath adds a follow-up when an invoice is late or a promised payment date passes."}</p>
          <small>Last automatic check: {checkTime(automation.lastSuccessAt)}{automation.lastAttemptAt !== automation.lastSuccessAt ? ` · Last try: ${checkTime(automation.lastAttemptAt)}` : ""}{automation.lastStatus && automation.lastStatus !== "succeeded" ? ` (${automation.lastStatus}${automation.lastErrorCode ? `: ${automation.lastErrorCode}` : ""})` : ""}</small>
          {automation.lastManualAt && <small>You checked by hand at {checkTime(automation.lastManualAt)}.</small>}
        </div>
        <div className="followup-checks-actions">
          <AutomationCheck />
          <Link className="row-action is-quiet" href="/invoices?filter=commitment">See promised payments <DashboardIcon name="arrowRight" size={14} /></Link>
        </div>
      </aside>
    </section>
    <section className="followup-summary" aria-label="Follow-up summary">
      <div className="followup-summary-total">
        <span>Waiting on follow-ups</span>
        <strong className="num">{formatPHP(tiedBalance)}</strong>
        <p>Still owed on invoices with an open task. Not cash yet.</p>
        <Link className="followup-source-link" href="/invoices?filter=unpaid">See unpaid invoices <DashboardIcon name="arrowRight" size={15} /></Link>
      </div>
      <div className="followup-summary-tasks">
        <div className="followup-summary-tasks-head"><span>Open tasks by due date</span><strong className="num">{open.length}</strong></div>
        <div className="followup-stack" role="img" aria-label={counts.map(({ label, count }) => `${label}: ${count}`).join(", ")}>
          {open.length ? counts.filter(({ count }) => count > 0).map(({ key, count }) => <span key={key} className={`is-${key}`} style={{ flexGrow: count }} />) : <span className="is-empty" />}
        </div>
        <ul className="followup-legend">
          {counts.map(({ key, label, count }) => <li key={key} className={`is-${key}`} data-count={count}><i aria-hidden="true" /><span>{label}</span><strong className="num">{count}</strong></li>)}
          <li className="is-done"><i aria-hidden="true" /><span>Done</span><strong className="num">{done}</strong></li>
        </ul>
      </div>
    </section>
  </WorkspaceShell>;
}
