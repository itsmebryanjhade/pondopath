import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { syncBusinessIfDue } from "@/lib/server/google-sync";
import { z } from "zod";
import { getWorkspace } from "@/lib/server/workspace";
import { getIntakePage, isBulkConfirmable } from "@/lib/server/intake";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import WorkspaceLoading from "@/components/workspace-loading";
import { IntakeReview } from "@/components/intake-review";
import { IntakeBulkConfirm } from "@/components/intake-bulk-confirm";
import { createClient } from "@/lib/supabase/server";

async function getGoogle(businessId: string) {
  const client = await createClient();
  const [connection, files] = await Promise.all([
    client.from("google_connections").select("account_email,status").eq("business_id", businessId).maybeSingle(),
    client.from("intake_sources").select("id,label,connector_status,connector_settings,mapping,last_run_at,last_run_summary").eq("business_id", businessId).eq("kind", "drive_file").order("created_at"),
  ]);
  if (connection.error || files.error) throw new Error("Google connections could not be loaded. Try refreshing.");
  return { connection: connection.data, files: files.data };
}

type InboxParams = { page?: string; state?: string; item?: string; google?: string };
async function Inbox({ searchParams }: { searchParams: Promise<InboxParams> }) {
  const [workspace, params] = await Promise.all([getWorkspace(), searchParams]);
  const page = /^[1-9]\d{0,3}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const state = params.state === "resolved" ? "resolved" : "open";
  const selected = z.uuid().safeParse(params.item);
  const inbox = await getIntakePage(page, state, selected.success ? selected.data : undefined);
  const google = await getGoogle(workspace.actor.businessId);
  const googleConfigured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  // Opening the inbox catches up connected Drive files after the response is sent; the page never waits for Google.
  if (googleConfigured && google.connection?.status === "connected") { const businessId = workspace.actor.businessId; after(() => syncBusinessIfDue(businessId)); }
  const sources = new Map(inbox.sources.map(source => [source.id, source.label]));
  const context = { revision: workspace.revision, actor: workspace.actor, customers: workspace.customers, invoices: workspace.invoices, expenses: workspace.expenses, members: workspace.members };
  return <WorkspaceShell workspace={workspace} className="section-page imports-page" header={<WorkspacePageHeading title="Review Inbox" description="Check imported rows before they reach your invoices, bills or forecast." workspace={workspace} actions={<Link className="button" href="/add">Add records</Link>} />}>
    <nav aria-label="Review Inbox filters" className="inbox-tabs">
      <Link aria-current={!selected.success && state === "open" ? "page" : undefined} href="/imports">To review{state === "open" && !selected.success && <span className="history-count">{inbox.count}</span>}</Link>
      <Link aria-current={!selected.success && state === "resolved" ? "page" : undefined} href="/imports?state=resolved">Done{state === "resolved" && !selected.success && <span className="history-count">{inbox.count}</span>}</Link>
      {selected.success && <span className="inbox-tabs-note">Showing one item · <Link className="text-link" href="/imports">See all</Link></span>}
      {!selected.success && inbox.count > 20 && <span className="inbox-tabs-note">Showing {(page - 1) * 20 + 1}&ndash;{Math.min(page * 20, inbox.count)} of {inbox.count}</span>}
    </nav>
    {!inbox.items.length && <section className="records-panel inbox-empty"><div className="intake-panel-body">{state === "open"
      ? <><h2>You&rsquo;re all caught up</h2><p className="muted">When you import a file or a Google Sheet, each new or changed row waits here. Nothing reaches your invoices, bills or forecast until you confirm it.</p></>
      : <><h2>Nothing finished yet</h2><p className="muted">Rows you confirm or reject show up here, so you can see what was added and who checked it.</p></>}</div></section>}
    {state === "open" && inbox.items.some(isBulkConfirmable) && <IntakeBulkConfirm items={inbox.items} revision={workspace.revision} sourceLabels={Object.fromEntries(sources)} />}
    {inbox.items.map(item => <IntakeReview key={`${item.id}:${item.review_version}`} item={item} sourceLabel={sources.get(item.source_id) ?? "Source unavailable"} workspace={context} />)}
    {!selected.success && (page > 1 || page * 20 < inbox.count) && <nav className="intake-buttons" aria-label="Review Inbox pages">{page > 1 && <Link className="row-action is-quiet" href={`/imports?state=${state}&page=${page - 1}`}>Previous 20</Link>}{page * 20 < inbox.count && <Link className="row-action is-quiet" href={`/imports?state=${state}&page=${page + 1}`}>Next 20</Link>}</nav>}
  </WorkspaceShell>;
}

export default function ImportsPage(props: { searchParams: Promise<InboxParams> }) {
  return <Suspense fallback={<WorkspaceLoading />}><Inbox {...props} /></Suspense>;
}
