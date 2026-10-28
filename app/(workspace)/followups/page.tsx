import { Suspense } from "react";
import Link from "next/link";
import WorkspaceLoading from "../loading";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { FollowupPanel } from "@/components/followup-panel";

export default function FollowupsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) { return <Suspense fallback={<WorkspaceLoading />}><FollowupsContent searchParams={searchParams} /></Suspense>; }

async function FollowupsContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
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
  return <WorkspaceShell workspace={workspace} header={<WorkspacePageHeading workspace={workspace} title="Follow-ups" description="Keep the next collection action, owner and due date visible." actions={<Link className="button" href="/invoices?filter=no_followup">Find invoices without a follow-up</Link>} />}>
    <dl className="view-metrics"><div className="panel"><dt>Open actions</dt><dd className="num">{open.length}</dd></div><div className="panel"><dt>Overdue actions</dt><dd className="num">{overdue.length}</dd></div><div className="panel"><dt>Completed actions</dt><dd className="num">{workspace.followups.filter((task) => task.state === "completed").length}</dd></div></dl>
    {workspace.automation.stale && <p className="panel" style={{ marginBottom: 20 }}>Automatic follow-up checks are not current. Review unresolved customer commitments and existing open tasks before following up again.</p>}
    <div className="followup-worklist">{invoices.slice((page - 1) * 20, page * 20).map((invoice) => <details className="panel" key={invoice.id}><summary>{invoice.number} · {workspace.customers.find((customer) => customer.id === invoice.customer_id)?.name ?? "Customer unavailable"} · {open.filter((task) => task.invoice_id === invoice.id).length} open</summary><Link className="text-link" href={`/invoices/${invoice.id}`}>Review source invoice →</Link><FollowupPanel workspace={workspace} invoice={invoice} /></details>)}</div>
    {!invoices.length && <p className="panel empty-state">No follow-up tasks entered. Open an unpaid invoice to schedule its next action.</p>}
    {pages > 1 && <nav className="pagination" aria-label="Follow-up pages"><span>Page {page} of {pages}</span>{page > 1 && <Link href={`/followups?page=${page - 1}`}>Previous</Link>}{page < pages && <Link href={`/followups?page=${page + 1}`}>Next</Link>}</nav>}
  </WorkspaceShell>;
}
