import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { getWorkspace } from "@/lib/server/workspace";
import { getIntakePage } from "@/lib/server/intake";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import WorkspaceLoading from "@/components/workspace-loading";
import { CsvImport } from "@/components/csv-import";
import { IntakeReview } from "@/components/intake-review";

type InboxParams = { page?: string; state?: string; item?: string };
async function Inbox({ searchParams }: { searchParams: Promise<InboxParams> }) {
  const [workspace, params] = await Promise.all([getWorkspace(), searchParams]);
  const page = /^[1-9]\d{0,3}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const state = params.state === "resolved" ? "resolved" : "open";
  const selected = z.uuid().safeParse(params.item);
  const inbox = await getIntakePage(page, state, selected.success ? selected.data : undefined);
  const sources = new Map(inbox.sources.map(source => [source.id, source.label]));
  const context = { revision: workspace.revision, actor: workspace.actor, customers: workspace.customers, invoices: workspace.invoices, expenses: workspace.expenses, members: workspace.members };
  return <WorkspaceShell workspace={workspace} className="section-page imports-page" header={<WorkspacePageHeading title="Review Inbox" description="Review imported changes before they reach your invoices, expenses or cash plan." workspace={workspace} actions={<Link className="button secondary" href="/invoices">Customer invoices</Link>} />}>
    <CsvImport sources={inbox.sources} customers={workspace.customers} owner={workspace.actor.role === "owner"} />
    <nav aria-label="Review Inbox filters" className="intake-buttons"><Link className="button secondary" aria-current={!selected.success && state === "open" ? "page" : undefined} href="/imports">Pending reviews</Link><Link className="button secondary" aria-current={!selected.success && state === "resolved" ? "page" : undefined} href="/imports?state=resolved">Resolved and previous versions</Link><span className="muted">{selected.success ? "Selected proposal" : `${inbox.count} ${state === "open" ? "pending" : "resolved"} items · 20 per page`}</span></nav>
    {!inbox.items.length && <section className="records-panel"><div className="intake-panel-body"><h2>{state === "open" ? "No proposals waiting for review" : "No resolved proposals on this page"}</h2><p className="muted">Import a CSV or XLSX above to prepare proposals. Saved financial records change only after you confirm an individual item.</p></div></section>}
    {inbox.items.map(item => <IntakeReview key={`${item.id}:${item.review_version}`} item={item} sourceLabel={sources.get(item.source_id) ?? "Source unavailable"} workspace={context} />)}
    {!selected.success && <nav className="intake-buttons" aria-label="Review Inbox pages">{page > 1 && <Link className="button secondary" href={`/imports?state=${state}&page=${page - 1}`}>Previous</Link>}{page * 20 < inbox.count && <Link className="button secondary" href={`/imports?state=${state}&page=${page + 1}`}>Next</Link>}</nav>}
  </WorkspaceShell>;
}

export default function ImportsPage(props: { searchParams: Promise<InboxParams> }) {
  return <Suspense fallback={<WorkspaceLoading />}><Inbox {...props} /></Suspense>;
}
