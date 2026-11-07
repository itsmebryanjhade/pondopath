import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { syncBusinessIfDue } from "@/lib/server/google-sync";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import WorkspaceLoading from "@/components/workspace-loading";
import { AddRecords } from "@/components/add-records";
import { GoogleConnect } from "@/components/google-connect";
import { SheetConnection } from "@/components/sheet-connection";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add records | PondoPath" };

async function getConnections(businessId: string) {
  const client = await createClient();
  const [connection, files, sheets] = await Promise.all([
    client.from("google_connections").select("account_email,status").eq("business_id", businessId).maybeSingle(),
    client.from("intake_sources").select("id,label,connector_status,connector_settings,mapping,last_run_at,last_run_summary").eq("business_id", businessId).eq("kind", "drive_file").order("created_at"),
    client.from("intake_sources").select("id,label,created_at,mapping,connector_status,connector_settings,last_run_at,last_run_summary").eq("business_id", businessId).eq("kind", "google_sheet").order("created_at"),
  ]);
  if (connection.error || files.error || sheets.error) throw new Error("Connected files could not be loaded. Try refreshing.");
  return { connection: connection.data, files: files.data, sheets: sheets.data, checkedAt: Date.now() };
}

type AddParams = { google?: string };
async function Add({ searchParams }: { searchParams: Promise<AddParams> }) {
  const [workspace, params] = await Promise.all([getWorkspace(), searchParams]);
  const owner = workspace.actor.role === "owner";
  const google = await getConnections(workspace.actor.businessId);
  const googleConfigured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  // Opening this page catches up connected Drive files after the response is sent; the page never waits for Google.
  if (googleConfigured && google.connection?.status === "connected") { const businessId = workspace.actor.businessId; after(() => syncBusinessIfDue(businessId)); }
  const notice = params.google === "connected" || params.google === "failed" ? params.google : undefined;
  return <WorkspaceShell workspace={workspace} className="section-page add-records-page" header={<WorkspacePageHeading title="Add your records" description="Bring them in from a file, or type them in." workspace={workspace} actions={<Link className="button secondary" href="/imports">Review imports</Link>} />}>
    <AddRecords customers={workspace.customers} googleOpenAtStart={!!notice || google.files.length > 0}
      googleSlot={<GoogleConnect owner={owner} configured={googleConfigured} connection={google.connection} files={google.files} customers={workspace.customers} checkedAt={google.checkedAt} notice={notice} />} />
    <details className="records-panel add-advanced"><summary>Advanced</summary>
      <SheetConnection sources={google.sheets} customers={workspace.customers} owner={owner} serviceAccountEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""} checkedAt={google.checkedAt} />
    </details>
  </WorkspaceShell>;
}

export default function AddRecordsPage(props: { searchParams: Promise<AddParams> }) {
  return <Suspense fallback={<WorkspaceLoading />}><Add {...props} /></Suspense>;
}
