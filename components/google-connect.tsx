"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoogleFileAction, disconnectGoogleAction, pickerSessionAction, readGoogleSetupAction, saveGoogleSetupAction, syncNowAction } from "@/app/(workspace)/imports/google-actions";
import { disconnectConnectorAction, setConnectorPausedAction } from "@/app/(workspace)/imports/connector-actions";
import { googleMessage } from "@/lib/domain/google-messages";
import type { AutoFields, AutoMapping } from "@/lib/domain/reader";
import { ImportSelector, readSelectorForm, selectorProblems, type SelectorLabel } from "./import-selector";

export type DriveFile = { id: string; label: string; connector_status: string | null; mapping: unknown; connector_settings: unknown; last_run_at: string | null; last_run_summary: unknown };
type Connection = { account_email: string; status: string } | null;
type Setup = { sourceId: string; tabs: string[]; tab: string; saved?: Partial<AutoMapping>; data?: { headers: string[]; rows: string[][]; fields: AutoFields; labels: SelectorLabel[] } };
const PICKER_MIMES = "application/vnd.google-apps.spreadsheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

function ago(at: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}
/** Plain-words summary of a file's last sync, built from the stored run summary. */
export function syncSummary(summary: unknown, at: string | null, now: number, status?: string | null): string {
  if (!summary || !at || typeof summary !== "object") return "Not synced yet.";
  const { result, errorCode, counts = {} } = summary as { result?: string; errorCode?: string | null; counts?: Record<string, unknown> };
  if (result === "failed") return `Last sync ${ago(at, now)} failed: ${googleMessage(errorCode ?? "")}`;
  if (result === "paused") return `Paused · last checked ${ago(at, now)}.`;
  if ((result === "first_read" || result === "awaiting_mapping") && (status === "active" || status === "paused")) return "Set up. Click Sync now, or wait for the next automatic sync.";
  if (result === "first_read" || result === "awaiting_mapping") return `Read ${ago(at, now)}. Finish setup to start syncing.`;
  const number = (value: unknown) => typeof value === "number" ? value : 0;
  const choose = Array.isArray(counts.choose) ? counts.choose.length : 0;
  const parts = [`${number(counts.staged)} sent to review`, `${number(counts.unchanged)} unchanged`];
  if (number(counts.payments)) parts.push(`${number(counts.payments)} ${number(counts.payments) === 1 ? "payment" : "payments"} to record in Collections`);
  if (choose) parts.push(`${choose} need your choice`);
  return `Synced ${ago(at, now)}: ${parts.join(", ")}`;
}

type PickerData = { action: string; docs?: { id: string }[] };
type GoogleGlobal = { picker: { PickerBuilder: new () => { addView(view: unknown): unknown; setOAuthToken(token: string): unknown; setDeveloperKey(key: string): unknown; setAppId(id: string): unknown; setCallback(fn: (data: PickerData) => void): unknown; build(): { setVisible(v: boolean): void } }; DocsView: new (id?: unknown) => { setMimeTypes(types: string): unknown; setIncludeFolders(v: boolean): unknown; setMode(mode: unknown): unknown }; DocsUploadView: new () => unknown; DocsViewMode: { LIST: unknown }; ViewId: { DOCS: unknown }; Action: { PICKED: string } } };
declare global { interface Window { gapi?: { load(name: string, done: () => void): void }; google?: GoogleGlobal } }

/** Loads Google's Picker script only after the owner asks to choose a file. */
async function loadPicker(): Promise<GoogleGlobal> {
  if (!window.gapi) await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js"; script.async = true;
    script.onload = () => resolve(); script.onerror = () => reject(new Error("GOOGLE_UNAVAILABLE"));
    document.head.appendChild(script);
  });
  await new Promise<void>(resolve => window.gapi!.load("picker", resolve));
  return window.google!;
}

export function GoogleConnect({ owner, configured, connection, files, customers, checkedAt, notice }: {
  owner: boolean; configured: boolean; connection: Connection; files: DriveFile[]; customers: { id: string; name: string }[]; checkedAt: number; notice?: "connected" | "failed";
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState(notice === "connected" ? "Google is connected. Choose a file to bring in." : notice === "failed" ? "Google wasn't connected. Try again, and allow access to the files you pick." : "");
  const [setup, setSetup] = useState<Setup | null>(null);
  const connected = connection?.status === "connected";

  const readTab = (sourceId: string, tabs: string[], tab: string, saved?: Partial<AutoMapping>) => start(async () => {
    const result = await readGoogleSetupAction(sourceId, tab);
    if (result.ok) setSetup({ sourceId, tabs: result.data.tabs.length ? result.data.tabs : tabs, tab: result.data.tab ?? tab, saved, data: result.data });
    else setMessage(result.message);
  });
  const choose = () => start(async () => {
    setMessage("");
    const session = await pickerSessionAction();
    if (!session.ok) { setMessage(session.message); return; }
    let google: GoogleGlobal;
    try { google = await loadPicker(); } catch { setMessage(googleMessage("GOOGLE_UNAVAILABLE")); return; }
    // A flat, searchable list of the owner's spreadsheets (no folders to dig through), plus an Upload tab
    // for an Excel or CSV file that is only on their computer: Google stores it in their Drive so it can keep syncing.
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setMimeTypes(PICKER_MIMES); view.setIncludeFolders(false); view.setMode(google.picker.DocsViewMode.LIST);
    const upload = new google.picker.DocsUploadView();
    const builder = new google.picker.PickerBuilder() as unknown as Record<string, (value: unknown) => unknown> & { build(): { setVisible(v: boolean): void } };
    builder.addView(view); builder.addView(upload); builder.setOAuthToken(session.data.token); builder.setDeveloperKey(session.data.pickerKey); builder.setAppId(session.data.projectNumber);
    builder.setCallback((data: unknown) => {
      const picked = data as PickerData;
      if (picked.action !== google.picker.Action.PICKED || !picked.docs?.[0]) return;
      start(async () => {
        const created = await createGoogleFileAction(picked.docs![0].id);
        if (!created.ok) { setMessage(created.message); return; }
        router.refresh();
        if (created.data.tab) readTab(created.data.sourceId, created.data.tabs, created.data.tab);
        else readTab(created.data.sourceId, [], "");
      });
    });
    builder.build().setVisible(true);
  });

  return <section className="records-panel" id="connect-google" aria-labelledby="google-title">
    <div className="records-head"><div><h2 id="google-title">Connect Google</h2><p>Bring in a Google Sheet, or an Excel or CSV file in your Drive. PondoPath only sees the files you pick, and never changes them.</p></div></div>
    <div className="intake-panel-body">
      {!configured ? <p className="muted">{googleMessage("GOOGLE_NOT_CONFIGURED")}</p>
        : !connection || connection.status === "disconnected"
        ? (owner ? <p><a className="button" href="/api/google/connect">Connect Google</a></p> : <p className="muted">Ask the owner to connect Google.</p>)
        : <>
          {connection?.status === "needs_reconnect"
            ? <p role="status">Google needs you to sign in again before files can sync. {owner && <a className="button" href="/api/google/connect">Reconnect Google</a>}</p>
            : <p>{`Connected as ${connection.account_email}`}</p>}
          {owner && <div className="intake-buttons">
            {connected && <button className="button" disabled={busy} onClick={choose}>{busy ? "Working…" : "Choose a file"}</button>}
            <button className="button secondary" disabled={busy} onClick={() => { if (window.confirm("Disconnect Google? Syncing stops for every file. History and proposals are kept.")) start(async () => { const result = await disconnectGoogleAction(); setMessage(result.ok ? "Google is disconnected." : result.message); router.refresh(); }); }}>Disconnect Google</button>
          </div>}
        </>}
      {message && <p role="status">{message}</p>}
      {setup && owner && <form className="intake-preview" onSubmit={event => {
        event.preventDefault();
        if (!setup.data) return;
        const data = new FormData(event.currentTarget);
        const problems = selectorProblems(data, setup.data.labels);
        if (problems.length) { setMessage(problems.join(" ")); return; }
        const mapping: AutoMapping = readSelectorForm(data, setup.data.labels, setup.saved);
        start(async () => {
          const result = await saveGoogleSetupAction(setup.sourceId, mapping);
          if (result.ok) { setSetup(null); setMessage("Saved. New and changed rows will arrive in Review imports."); router.refresh(); } else setMessage(result.message);
        });
      }}>
        <h3>Set up {files.find(file => file.id === setup.sourceId)?.label ?? "the file"}</h3>
        {setup.tabs.length > 1 && <label className="form-field"><span>Tab</span><select className="field" value={setup.tab} disabled={busy} onChange={event => readTab(setup.sourceId, setup.tabs, event.target.value, setup.saved)}>{setup.tabs.map(tab => <option key={tab}>{tab}</option>)}</select></label>}
        {setup.data ? <ImportSelector key={`${setup.sourceId}:${setup.tab}`} headers={setup.data.headers} rows={setup.data.rows} labels={setup.data.labels} fields={setup.data.fields} customers={customers} saved={setup.saved} disabled={busy}
          onLabels={labels => setSetup(current => current?.data ? { ...current, data: { ...current.data, labels } } : current)} /> : <p className="muted">Reading the file…</p>}
        <div className="intake-buttons"><button className="button" disabled={busy || !setup.data}>Save setup</button><button type="button" className="button secondary" disabled={busy} onClick={() => setSetup(null)}>Cancel</button></div>
      </form>}
      {files.map(file => {
        const settings = (file.connector_settings ?? {}) as { tab?: string | null; name?: string };
        const waiting = file.connector_status === "awaiting_first_read" || file.connector_status === "awaiting_mapping";
        return <article key={file.id} className="intake-connection">
          <h3>{file.label}{settings.tab ? ` · ${settings.tab}` : ""}</h3>
          <p className="muted">{file.connector_status === "disconnected" ? "Disconnected. History and proposals are kept." : waiting ? "Finish setup to start syncing." : syncSummary(file.last_run_summary, file.last_run_at, checkedAt, file.connector_status)}</p>
          {connected && !waiting && file.connector_status !== "disconnected" && <div className="intake-buttons">
            <button className="button" disabled={busy} onClick={() => start(async () => {
              const result = await syncNowAction(file.id);
              setMessage(result.ok ? `${file.label}: ${syncSummary({ result: result.data.result, errorCode: result.data.errorCode, counts: result.data }, new Date().toISOString(), Date.now())}` : result.message);
              router.refresh();
            })}>{busy ? "Syncing…" : "Sync now"}</button>
          </div>}
          {owner && file.connector_status !== "disconnected" && <div className="intake-buttons">
            {connected && <button className="button secondary" disabled={busy} onClick={() => readTab(file.id, [], settings.tab ?? "", waiting ? undefined : (file.mapping ?? undefined) as Partial<AutoMapping> | undefined)}>{waiting ? "Finish setup" : "Change setup"}</button>}
            {!waiting && <button className="button secondary" disabled={busy} onClick={() => start(async () => { const result = await setConnectorPausedAction(file.id, file.connector_status !== "paused"); if (!result.ok) setMessage(result.message); router.refresh(); })}>{file.connector_status === "paused" ? "Resume" : "Pause"}</button>}
            <button className="button secondary" disabled={busy} onClick={() => { if (window.confirm("Stop syncing this file? History and proposals are kept.")) start(async () => { const result = await disconnectConnectorAction(file.id); if (!result.ok) setMessage(result.message); router.refresh(); }); }}>Disconnect file</button>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
