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
import { SheetConnection } from "@/components/sheet-connection";
import { GoogleConnect } from "@/components/google-connect";
import { createClient } from "@/lib/supabase/server";

async function getSheetConnections(businessId: string) {
  const client = await createClient();
  const result = await client.from("intake_sources").select("id,label,created_at,mapping,connector_status,connector_settings,last_run_at,last_run_summary").eq("business_id", businessId).eq("kind", "google_sheet").order("created_at");
  if (result.error) throw new Error("Sheet connections could not be loaded. Try refreshing.");
  return { sources: result.data, checkedAt: Date.now() };
}

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
  const [connections, google] = await Promise.all([getSheetConnections(workspace.actor.businessId), getGoogle(workspace.actor.businessId)]);
  const googleConfigured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  const sources = new Map(inbox.sources.map(source => [source.id, source.label]));
  const context = { revision: workspace.revision, actor: workspace.actor, customers: workspace.customers, invoices: workspace.invoices, expenses: workspace.expenses, members: workspace.members };
  return <WorkspaceShell workspace={workspace} className="section-page imports-page" header={<WorkspacePageHeading title="Review Inbox" description="Review imported changes before they reach your invoices, expenses or cash plan." workspace={workspace} actions={<Link className="button secondary" href="/invoices">Customer invoices</Link>} />}>
    <CsvImport sources={inbox.sources} customers={workspace.customers} owner={workspace.actor.role === "owner"} />
    <GoogleConnect owner={workspace.actor.role === "owner"} configured={googleConfigured} connection={google.connection} files={google.files} customers={workspace.customers} checkedAt={connections.checkedAt} notice={params.google === "connected" || params.google === "failed" ? params.google : undefined} />
    <details className="records-panel"><summary>Advanced: operator route (n8n)</summary>
      <SheetConnection sources={connections.sources} customers={workspace.customers} owner={workspace.actor.role === "owner"} serviceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""} checkedAt={connections.checkedAt} />
    </details>
    <nav aria-label="Review Inbox filters" className="intake-buttons"><Link className="button secondary" aria-current={!selected.success && state === "open" ? "page" : undefined} href="/imports">Pending reviews</Link><Link className="button secondary" aria-current={!selected.success && state === "resolved" ? "page" : undefined} href="/imports?state=resolved">Resolved and previous versions</Link><span className="muted">{selected.success ? "Selected proposal" : `${inbox.count} ${state === "open" ? "pending" : "resolved"} items · 20 per page`}</span></nav>
    {!inbox.items.length && <section className="records-panel"><div className="intake-panel-body"><h2>{state === "open" ? "No proposals waiting for review" : "No resolved proposals on this page"}</h2><p className="muted">Import a CSV or XLSX above to prepare proposals. Saved financial records change only after you confirm an individual item.</p></div></section>}
    {inbox.items.map(item => <IntakeReview key={`${item.id}:${item.review_version}`} item={item} sourceLabel={sources.get(item.source_id) ?? "Source unavailable"} workspace={context} />)}
    {!selected.success && <nav className="intake-buttons" aria-label="Review Inbox pages">{page > 1 && <Link className="button secondary" href={`/imports?state=${state}&page=${page - 1}`}>Previous</Link>}{page * 20 < inbox.count && <Link className="button secondary" href={`/imports?state=${state}&page=${page + 1}`}>Next</Link>}</nav>}
  </WorkspaceShell>;
}

export default function ImportsPage(props: { searchParams: Promise<InboxParams> }) {
  return <Suspense fallback={<WorkspaceLoading />}><Inbox {...props} /></Suspense>;
}
