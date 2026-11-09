"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Database, Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/domain/commands";
import { createSheetConnectionAction, saveConnectorMappingAction, setConnectorPausedAction, replaceConnectorKeyAction, disconnectConnectorAction } from "@/app/(workspace)/imports/connector-actions";
import { ImportMappingFields, readMappingForm, type MappingKind } from "./csv-import";
import { Field } from "./command-form";

export type SheetSource = Pick<Database["public"]["Tables"]["intake_sources"]["Row"], "id" | "label" | "created_at" | "mapping" | "connector_status" | "connector_settings" | "last_run_at" | "last_run_summary">;
const object = (value: Json | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const count = (value: Json | undefined) => typeof value === "number" ? value : 0;
const time = (value: string) => new Date(value).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });

function CopyValue({ value, label }: { value: string; label: string }) {
  const [notice, setNotice] = useState("");
  return <><button className="button secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setNotice("Copied."); } catch { setNotice("Clipboard access is blocked. Select the text and copy it manually."); } }}>{label}</button>{notice && <p role="status">{notice}</p>}</>;
}
export function OneTimeConnectionKey({ sourceId, value, onDismiss }: { sourceId: string; value: string; onDismiss: () => void }) {
  return <aside className="intake-panel-body" aria-label="New connection key"><h3>Save your connection key</h3><p>Copy this key now. It will not be shown again.</p><p>Keep it private. Your n8n setup operator needs this key and connection ID <code>{sourceId}</code>.</p><label className="form-field"><span>Connection key</span><textarea className="field" value={value} readOnly autoComplete="off" spellCheck={false} /></label><div className="intake-buttons"><CopyValue value={value} label="Copy key" /><button type="button" className="button secondary" onClick={onDismiss}>I saved the key</button></div></aside>;
}
function ConnectionStatus({ source, checkedAt }: { source: SheetSource; checkedAt: number }) {
  const summary = object(source.last_run_summary), counts = object(summary.counts);
  const settings = object(source.connector_settings);
  const stale = !["paused", "disconnected"].includes(source.connector_status ?? "") && checkedAt - Date.parse(source.last_run_at ?? source.created_at) > 3 * (count(settings.intervalMinutes) || 10) * 60_000;
  const errors: Record<string, string> = {
    SHEET_ACCESS_DENIED: "n8n can't open the Sheet — share it with the robot email as Viewer.",
    SHEET_NOT_FOUND: "The selected Sheet or tab could not be found. Check the link and sharing.",
    READ_FAILED: "The Sheet could not be read. Check n8n and retry.",
    MAPPING_HEADER_MISSING: "A mapped column is missing — update the mapping.",
    INVALID_MAPPING: "Check and save the column mapping again.",
    INVALID_SHEET: "Use up to 500 rows and 24 unique, nonempty column headers.",
    CONNECTED_OWNER_REMOVED: "The owner who connected this Sheet is no longer an owner. Reconnect the Sheet as a current owner.",
  };
  return <div aria-live="polite">
    {source.connector_status === "awaiting_first_read" && <p>Waiting for the first read from n8n…</p>}
    {source.connector_status === "awaiting_mapping" && <p>First read received. The owner can now map the columns.</p>}
    {source.connector_status === "paused" && <p>Paused by owner. New reads do not send proposals.</p>}
    {source.connector_status === "disconnected" && <p>Disconnected. Previous proposals and history are kept.</p>}
    {source.last_run_at && <p>Last read {time(source.last_run_at)} · {count(counts.staged)} sent to review · {count(counts.unchanged)} unchanged · {count(counts.skippedByFilter)} skipped by filter</p>}
    {typeof summary.errorCode === "string" && <p role="alert" className="form-error">{summary.errorCode === "MAPPING_HEADER_MISSING" && Array.isArray(counts.missingHeaders) && typeof counts.missingHeaders[0] === "string"
      ? `Column ‘${counts.missingHeaders.filter(value => typeof value === "string").join("’, ‘")}’ not found — update the mapping.`
      : errors[summary.errorCode] ?? "The connection needs attention. Check n8n and retry."}</p>}
    {stale && <p role="status">No read since {time(source.last_run_at ?? source.created_at)}. Reads catch up when n8n is running again.</p>}
    {count(counts.missing) > 0 && <p>{count(counts.missing)} rows missing since the last read. No saved records were deleted.</p>}
    {counts.morePending === true && <p>More rows are waiting. The next read sends up to 100 more to review.</p>}
    {Array.isArray(counts.invalid) && counts.invalid.length > 0 && <details><summary>{counts.invalid.length} rows invalid</summary><ul>{counts.invalid.map((value, index) => { const row = object(value); return <li key={index}>Row {count(row.row)}: {typeof row.reason === "string" ? row.reason : "Check the mapped values."}</li>; })}</ul></details>}
  </div>;
}
function Connection({ source, owner, customers, checkedAt, showKey }: { source: SheetSource; owner: boolean; customers: { id: string; name: string }[]; checkedAt: number; showKey: (sourceId: string, key: string) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState("");
  const savedKind = object(source.mapping).kind;
  const [kind, setKind] = useState<MappingKind>(savedKind === "expense" || savedKind === "mixed" ? savedKind : "invoice");
  const settings = object(source.connector_settings);
  const headers = Array.isArray(settings.headers) ? settings.headers.filter((value): value is string => typeof value === "string") : [];
  const samples = Array.isArray(settings.samples) ? settings.samples.filter(Array.isArray) : [];
  const disconnected = source.connector_status === "disconnected";
  const run = (operation: () => Promise<ActionResult<unknown>>, message: string) => start(async () => { const result = await operation(); setNotice(result.ok ? message : result.message); if (result.ok) router.refresh(); });
  return <article className="intake-panel-body"><h3>{source.label}</h3><ConnectionStatus source={source} checkedAt={checkedAt} />
    {owner && !disconnected && <>
      <p>Connection ID: <code>{source.id}</code></p>
      {headers.length > 0 && <details open={source.connector_status === "awaiting_mapping"}><summary>Map or update columns</summary>
        {samples.length > 0 && <div className="intake-table-scroll"><table className="intake-table"><caption>Sample rows from the selected Sheet</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{samples.map((values, index) => <tr key={index}>{headers.map((header, column) => <td key={header}>{String(values[column] ?? "")}</td>)}</tr>)}</tbody></table></div>}
        <form onSubmit={event => { event.preventDefault(); const mapping = readMappingForm(new FormData(event.currentTarget), kind); run(() => saveConnectorMappingAction(source.id, mapping), "Mapping saved. Future reads will use these columns."); }}><ImportMappingFields headers={headers} customers={customers} kind={kind} onKindChange={setKind} disabled={busy} defaults={object(source.mapping)} /><button className="button" disabled={busy}>Save mapping</button></form>
      </details>}
      <div className="intake-buttons">
        {["active", "paused"].includes(source.connector_status ?? "") && <button type="button" className="button secondary" disabled={busy} onClick={() => run(() => setConnectorPausedAction(source.id, source.connector_status !== "paused"), source.connector_status === "paused" ? "Connection resumed." : "Connection paused.")}>{source.connector_status === "paused" ? "Resume connection" : "Pause connection"}</button>}
        <button type="button" className="button secondary" disabled={busy} onClick={() => { if (!window.confirm("Replace this key? The old key will stop working immediately. Update n8n with the new key.")) return; start(async () => { const result = await replaceConnectorKeyAction(source.id); if (result.ok) { showKey(source.id, result.data.key); router.refresh(); } else setNotice(result.message); }); }}>Replace key</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => { if (window.confirm("Disconnect this Sheet? New reads will stop. Existing proposals and history will be kept.")) run(() => disconnectConnectorAction(source.id), "Connection disconnected."); }}>Disconnect</button>
      </div>
    </>}
    {notice && <p role="status">{notice}</p>}
  </article>;
}
export function SheetConnection({ owner, sources, serviceAccountEmail, customers, checkedAt }: { owner: boolean; sources: SheetSource[]; serviceAccountEmail: string; customers: { id: string; name: string }[]; checkedAt: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [fresh, setFresh] = useState<{ sourceId: string; key: string } | null>(null);
  return <section className="records-panel" aria-labelledby="sheet-connections-title">
    <div className="records-head"><div><h2 id="sheet-connections-title">{owner ? "Connect a Google Sheet" : "Google Sheet connections"}</h2><p>New and changed invoice or expense rows go to review. They never record payments automatically.</p></div><button type="button" className="button secondary" onClick={() => router.refresh()}>Refresh status</button></div>
    {owner && <div className="intake-panel-body">
      {serviceAccountEmail ? <><p>Share your fictional test Sheet with this email as <strong>Viewer</strong>. Connections run every 10 minutes while n8n is on.</p><label className="form-field"><span>Robot email</span><input className="field" value={serviceAccountEmail} readOnly /></label><CopyValue value={serviceAccountEmail} label="Copy email" /></> : <p>Google Sheet connections are not configured. Ask your setup operator.</p>}
      <form className="intake-upload-form" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); start(async () => { const result = await createSheetConnectionAction(String(data.get("label") ?? ""), String(data.get("sheetUrl") ?? "")); if (result.ok) { setFresh(result.data); setNotice("Connection created. Set up n8n, run the first read, then refresh status and map the columns."); form.reset(); router.refresh(); } else setNotice(result.message); }); }}>
        <Field label="Connection name" name="label" required maxLength={200} disabled={busy} /><Field label="Google Sheet link (selected tab)" name="sheetUrl" type="url" required maxLength={2048} disabled={busy} /><button className="button" disabled={busy || !serviceAccountEmail}>Create connection</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {fresh && <OneTimeConnectionKey sourceId={fresh.sourceId} value={fresh.key} onDismiss={() => setFresh(null)} />}
    </div>}
    {sources.map(source => <Connection key={source.id + ":" + source.connector_status} source={source} owner={owner} customers={customers} checkedAt={checkedAt} showKey={(sourceId, key) => setFresh({ sourceId, key })} />)}
    {!sources.length && <p className="intake-panel-body muted">No Google Sheets connected yet.</p>}
  </section>;
}
