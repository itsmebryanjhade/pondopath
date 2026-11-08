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
import { ManualEntry } from "@/components/manual-entry";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add records | PondoPath" };

async function getConnections(businessId: string) {
  const client = await createClient();
  const [connection, files] = await Promise.all([
    client.from("google_connections").select("account_email,status").eq("business_id", businessId).maybeSingle(),
    client.from("intake_sources").select("id,label,connector_status,connector_settings,mapping,last_run_at,last_run_summary").eq("business_id", businessId).eq("kind", "drive_file").order("created_at"),
  ]);
  if (connection.error || files.error) throw new Error("Connected files could not be loaded. Try refreshing.");
  return { connection: connection.data, files: files.data, checkedAt: Date.now() };
}

type AddParams = { google?: string; type?: string };
const ENTRY_TYPES = ["invoice", "expense", "receipt"] as const;
async function Add({ searchParams }: { searchParams: Promise<AddParams> }) {
  const [workspace, params] = await Promise.all([getWorkspace(), searchParams]);
  const owner = workspace.actor.role === "owner";
  const google = await getConnections(workspace.actor.businessId);
  const googleConfigured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  // Opening this page catches up connected Drive files after the response is sent; the page never waits for Google.
  if (googleConfigured && google.connection?.status === "connected") { const businessId = workspace.actor.businessId; after(() => syncBusinessIfDue(businessId)); }
  // Links such as /add?type=invoice open "Type it in" on that form.
  const entry = ENTRY_TYPES.find((value) => value === params.type);
  const notice = params.google === "connected" || params.google === "failed" ? params.google : undefined;
  return <WorkspaceShell workspace={workspace} className="section-page add-records-page" header={<WorkspacePageHeading title="Add your records" description="Bring them in from a file, or type them in." workspace={workspace} actions={<Link className="button secondary" href="/imports">Review Inbox</Link>} />}>
    <AddRecords customers={workspace.customers} manualOpenAtStart={!!entry} manualSlot={<ManualEntry workspace={workspace} initial={entry ?? "invoice"} />} googleOpenAtStart={!!notice || google.files.length > 0}
      googleSlot={<GoogleConnect owner={owner} configured={googleConfigured} connection={google.connection} files={google.files} customers={workspace.customers} checkedAt={google.checkedAt} notice={notice} />} />
  </WorkspaceShell>;
}

export default function AddRecordsPage(props: { searchParams: Promise<AddParams> }) {
  return <Suspense fallback={<WorkspaceLoading />}><Add {...props} /></Suspense>;
}
