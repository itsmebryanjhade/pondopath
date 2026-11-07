"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ensureFileSourceAction, inspectCsvAction, previewCsvAction, stageCsvAction } from "@/app/(workspace)/imports/actions";
import { countLabels, fileKind, heldLine, plainImportError, summaryLine } from "@/lib/domain/add-records";
import type { AutoFields } from "@/lib/domain/reader";
import type { CsvMapping } from "@/lib/domain/imports";
import { takePendingFile } from "@/lib/ui/pending-file";
import { CheckSummary, ChoiceCards, DoneState, DropArea, StepIndicator } from "./add-records-parts";
import { ImportSelector, readSelectorForm, selectorProblems, type SelectorLabel } from "./import-selector";
import { useToast } from "./toast-host";

/** Fired on the window when a file is dropped anywhere while this page is open. */
export const PENDING_FILE_EVENT = "pondopath:pending-file";

const OWNER_MESSAGE = "Ask the owner to add the first file.";
export const describeFailure = (message: string) => message === OWNER_MESSAGE ? message : plainImportError(message);
export const canSend = ({ busy, rows }: { busy: boolean; rows: number }) => !busy && rows > 0;

/** Open the column panel only when the person has something to decide. */
export function needsAttention({ fields, labels, customers }: { fields: AutoFields; labels: SelectorLabel[]; customers: number }) {
  if (!fields.externalId || !fields.amount) return true;
  if (labels.some((item) => item.label === "choose")) return true;
  return labels.some((item) => item.label === "invoice") && customers !== 1;
}

export function countNew(results: { status: string; replayed?: boolean }[]) {
  const open = results.filter((result) => ["pending", "needs_match"].includes(result.status));
  return { fresh: open.filter((result) => !result.replayed).length, already: open.filter((result) => result.replayed).length };
}

type Read = { sourceId: string; file: File; sheet: string; sheets: string[]; headers: string[]; rows: (string | number | boolean | null)[][]; fields: AutoFields; labels: SelectorLabel[] };
type Phase = { step: "file" } | { step: "check"; read: Read } | { step: "done"; fresh: number; already: number };

export function AddRecords({ customers, googleSlot }: { customers: { id: string; name: string }[]; googleSlot: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [phase, setPhase] = useState<Phase>({ step: "file" });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [labels, setLabels] = useState<SelectorLabel[]>([]);
  const adjust = useRef<HTMLDetailsElement>(null);

  const read = useCallback((file: File, sheet = "") => start(async () => {
    setError("");
    if (!fileKind(file.name)) { setError("Only Excel (.xlsx) and CSV files can be added."); return; }
    const source = await ensureFileSourceAction();
    if (!source.ok) { setError(describeFailure(source.message)); return; }
    const form = new FormData();
    form.set("file", file); form.set("sourceId", source.data);
    if (sheet) form.set("sheet", sheet);
    const result = await inspectCsvAction(form);
    if (!result.ok) { setError(describeFailure(result.message)); return; }
    const { headers, rows, fields, labels: found, sheets, sheet: chosen } = result.data;
    setLabels(found);
    setPhase({ step: "check", read: { sourceId: source.data, file, sheet: chosen ?? "", sheets, headers, rows: rows as Read["rows"], fields, labels: found } });
  }), []);

  useEffect(() => {
    const load = () => { const file = takePendingFile(); if (file) read(file); };
    load();
    window.addEventListener(PENDING_FILE_EVENT, load);
    return () => window.removeEventListener(PENDING_FILE_EVENT, load);
  }, [read]);

  const send = (event: React.FormEvent<HTMLFormElement>, current: Read) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const problems = selectorProblems(data, labels);
    const invoices = new Set(data.getAll("row").map(String));
    if (labels.some((item) => item.label === "invoice" && invoices.has(item.externalId)) && !String(data.get("customerId") ?? "")) problems.push("Pick a customer for invoices that don't name one.");
    if (problems.length) { setError(problems.join(" ")); if (adjust.current) adjust.current.open = true; return; }
    const mapping: CsvMapping = readSelectorForm(data, labels);
    const form = new FormData();
    form.set("file", current.file); form.set("sourceId", current.sourceId); form.set("mapping", JSON.stringify(mapping));
    if (current.sheet) form.set("sheet", current.sheet);
    start(async () => {
      setError("");
      const preview = await previewCsvAction(form);
      if (!preview.ok) { setError(describeFailure(preview.message)); return; }
      const staged = await stageCsvAction(form);
      if (!staged.ok) { setError(describeFailure(staged.message)); return; }
      const { fresh, already } = countNew(staged.data);
      setPhase({ step: "done", fresh, already });
      if (fresh) toast.show(`${fresh} ${fresh === 1 ? "row" : "rows"} ready to review`, { label: "Review", href: "/imports" });
      router.refresh();
    });
  };

  const counts = countLabels(labels);
  const sendable = counts.invoice + counts.expense;
  return (
    <div className="add-page">
      <StepIndicator step={phase.step} />
      {error && <p role="alert" className="add-note">{error}</p>}

      {phase.step === "file" && <>
        <div className="add-grid">
          <DropArea onFile={(file) => read(file)} dragging={dragging} onDragState={setDragging} disabled={busy} />
          <ChoiceCards googleOpen={googleOpen} onConnectGoogle={() => setGoogleOpen((open) => !open)} manualHref="/invoices#new-invoice" />
        </div>
        {busy && <p role="status" className="muted">Reading your file…</p>}
        {googleOpen && <div className="add-google">{googleSlot}</div>}
      </>}

      {phase.step === "check" && (
        <form className="add-check" noValidate onSubmit={(event) => send(event, phase.read)} aria-busy={busy}>
          <p className="muted">{phase.read.file.name}</p>
          {phase.read.sheets.length > 1 && <label className="form-field"><span>Which sheet?</span>
            <select className="field" value={phase.read.sheet} disabled={busy} onChange={(event) => read(phase.read.file, event.target.value)}>
              {phase.read.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}
            </select></label>}
          <CheckSummary summary={summaryLine(counts)} held={heldLine(counts)} headers={phase.read.headers}
            rows={phase.read.rows.map((cells, index) => ({ cells: cells.map((cell) => String(cell ?? "")), label: labels[index]?.label }))} />
          <details ref={adjust} className="add-adjust" open={needsAttention({ fields: phase.read.fields, labels: phase.read.labels, customers: customers.length })}>
            <summary>Check columns and rows</summary>
            <ImportSelector headers={phase.read.headers} rows={phase.read.rows} labels={phase.read.labels} fields={phase.read.fields} customers={customers}
              saved={customers.length === 1 ? { customerId: customers[0].id } : undefined} disabled={busy} onLabels={setLabels} />
          </details>
          <div className="add-done-actions" style={{ justifyContent: "flex-start" }}>
            <button className="add-button" disabled={!canSend({ busy, rows: sendable })}>{busy ? "Sending…" : `Send ${sendable} ${sendable === 1 ? "row" : "rows"} to review`}</button>
            <button type="button" className="add-button secondary" disabled={busy} onClick={() => { setError(""); setPhase({ step: "file" }); }}>Choose a different file</button>
          </div>
        </form>
      )}

      {phase.step === "done" && (phase.fresh
        ? <DoneState count={phase.fresh} reviewHref="/imports" onAddMore={() => setPhase({ step: "file" })} />
        : <div className="add-done"><h2>These rows were already sent</h2><p>{phase.already ? "They're waiting in the Review Inbox." : "Nothing new was found in this file."}</p>
          <div className="add-done-actions"><a className="add-button" href="/imports">Open the Review Inbox</a><button type="button" className="add-button secondary" onClick={() => setPhase({ step: "file" })}>Add more records</button></div></div>)}
    </div>
  );
}
