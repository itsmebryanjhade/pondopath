"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ensureFileSourceAction, inspectCsvAction, previewCsvAction, stageCsvAction } from "@/app/(workspace)/imports/actions";
import { countLabels, fileKind, heldLine, plainImportError, previewCell, previewColumns, sheetToRead, summarizeOutcome, summaryLine } from "@/lib/domain/add-records";
import type { AutoFields } from "@/lib/domain/reader";
import type { CsvMapping } from "@/lib/domain/imports";
import { takePendingFile } from "@/lib/ui/pending-file";
import { PENDING_FILE_EVENT } from "@/lib/ui/pending-file-event";
import { CheckSummary, ChoiceCards, DoneState, DropArea, StepIndicator } from "./add-records-parts";
import { ImportSelector, readSelectorForm, selectorProblems, type SelectorLabel } from "./import-selector";
import { useToast } from "./toast-host";

const OWNER_MESSAGE = "Ask the owner to add the first file.";
export const describeFailure = (message: string) => message === OWNER_MESSAGE ? message : plainImportError(message);
export const canSend = ({ busy, rows }: { busy: boolean; rows: number }) => !busy && rows > 0;

const REQUIRED_FIELDS: (keyof AutoFields)[] = ["externalId", "amount", "dueDate", "number", "label", "payee"];

/** Open the column panel whenever the server would need an answer the reader could not give. */
export function needsAttention({ fields, labels, customers }: { fields: AutoFields; labels: SelectorLabel[]; customers: number }) {
  if (REQUIRED_FIELDS.some((name) => !fields[name])) return true;
  if (labels.some((item) => item.label === "choose")) return true;
  // The server always asks for a customer to use for rows that name none.
  return customers !== 1;
}

const FIELD_LABELS: [string, string][] = [
  ["externalId", "The column that names each row"], ["amount", "Amount"], ["dueDate", "Due date"], ["number", "Invoice number"],
  ["label", "Description"], ["payee", "Supplier"], ["customerId", "Customer for invoices without one"],
];
/** Plain names of the choices still empty in the column panel. */
export function missingChoices(form: FormData): string[] {
  return FIELD_LABELS.filter(([key]) => !String(form.get(key) ?? "").trim()).map(([, label]) => label);
}

/** Rows that would be sent right now: ticked, not payments, and an Invoice or Expense label (the reader's or the person's). */
export function countSelection(form: FormData, labels: SelectorLabel[]): { invoice: number; expense: number } {
  const ticked = new Set(form.getAll("row").map(String));
  const total = { invoice: 0, expense: 0 };
  for (const item of labels) {
    if (item.label === "payment" || !ticked.has(item.externalId)) continue;
    const chosen = String(form.get(`label:${item.externalId}`) ?? "");
    const effective = chosen === "invoice" || chosen === "expense" ? chosen : item.label === "choose" ? "" : item.label;
    if (effective === "invoice" || effective === "expense") total[effective] += 1;
  }
  return total;
}

type Read = { id: number; sourceId: string; file: File; sheet: string; sheets: string[]; headers: string[]; rows: (string | number | boolean | null)[][]; fields: AutoFields; labels: SelectorLabel[] };
type Phase = { step: "file" } | { step: "check"; read: Read } | { step: "done"; fresh: number; already: number; skipped: number };

export function AddRecords({ customers, googleSlot, manualSlot, googleOpenAtStart = false }: { customers: { id: string; name: string }[]; googleSlot: ReactNode; manualSlot?: ReactNode; googleOpenAtStart?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const busyRef = useRef(false);
  const [phase, setPhase] = useState<Phase>({ step: "file" });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(googleOpenAtStart);
  const [manualOpen, setManualOpen] = useState(false);
  const [labels, setLabels] = useState<SelectorLabel[]>([]);
  const [selection, setSelection] = useState<{ invoice: number; expense: number } | null>(null);
  const adjust = useRef<HTMLDetailsElement>(null);
  const readCount = useRef(0);
  const shown = useRef(phase.step);

  const read = useCallback((file: File, sheet = "") => start(async () => {
    setError("");
    const kind = fileKind(file.name);
    if (!kind) { setError("Only Excel (.xlsx) and CSV files can be added."); return; }
    const source = await ensureFileSourceAction();
    if (!source.ok) { setError(describeFailure(source.message)); return; }
    const inspect = (name: string) => {
      const form = new FormData();
      form.set("file", file); form.set("sourceId", source.data);
      if (name) form.set("sheet", name);
      return inspectCsvAction(form);
    };
    let result = await inspect(sheet);
    // An Excel file read without a sheet comes back empty, so read its first sheet next.
    if (result.ok) { const first = sheetToRead(kind, result.data.sheet, result.data.sheets); if (first) result = await inspect(first); }
    if (!result.ok) { setError(describeFailure(result.message)); return; }
    const { headers, rows, fields, labels: found, sheets, sheet: chosen } = result.data;
    setLabels(found);
    setSelection(null);
    setPhase({ step: "check", read: { id: ++readCount.current, sourceId: source.data, file, sheet: chosen ?? "", sheets, headers, rows: rows as Read["rows"], fields, labels: found } });
  }), []);

  useEffect(() => {
    const load = () => { if (busyRef.current) return; const file = takePendingFile(); if (file) read(file); };
    load();
    window.addEventListener(PENDING_FILE_EVENT, load);
    return () => window.removeEventListener(PENDING_FILE_EVENT, load);
  }, [read]);

  useEffect(() => { busyRef.current = busy; }, [busy]);

  // Move focus to the new step so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (shown.current === phase.step) return;
    shown.current = phase.step;
    document.querySelector<HTMLElement>("[data-step-focus]")?.focus();
  }, [phase.step]);

  const send = (event: React.FormEvent<HTMLFormElement>, current: Read) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const problems = selectorProblems(data, labels);
    for (const name of missingChoices(data)) if (name !== "The column that names each row") problems.push(name === "Customer for invoices without one" && !customers.length ? "Add a customer on the Invoices page first." : `Choose a column for: ${name}.`);
    if (problems.length) { setError([...new Set(problems)].join(" ")); if (adjust.current) adjust.current.open = true; return; }
    const mapping: CsvMapping = readSelectorForm(data, labels);
    const form = new FormData();
    form.set("file", current.file); form.set("sourceId", current.sourceId); form.set("mapping", JSON.stringify(mapping));
    if (current.sheet) form.set("sheet", current.sheet);
    start(async () => {
      setError("");
      const preview = await previewCsvAction(form);
      if (!preview.ok) { setError(describeFailure(preview.message)); return; }
      if (!preview.data.rows.some((row) => row.candidate && !["invalid", "duplicate"].includes(row.status))) {
        setError("None of these rows can be added. Check the amounts and due dates in your file.");
        return;
      }
      const staged = await stageCsvAction(form);
      if (!staged.ok) { setError(describeFailure(staged.message)); return; }
      const outcome = summarizeOutcome(preview.data.rows.map((row) => row.status), staged.data);
      setPhase({ step: "done", ...outcome });
      if (outcome.fresh) toast.show(`${outcome.fresh} ${outcome.fresh === 1 ? "row" : "rows"} ready to review`, { label: "Review", href: "/imports" });
      router.refresh();
    });
  };

  const counts = countLabels(labels);
  const picked = selection ?? { invoice: counts.invoice, expense: counts.expense };
  const sendable = picked.invoice + picked.expense;
  const again = () => { setError(""); setPhase({ step: "file" }); };
  return (
    <div className="add-page">
      <StepIndicator step={phase.step} />
      {error && <p role="alert" className="add-note">{error}</p>}

      {phase.step === "file" && <>
        <div className="add-grid">
          <DropArea onFile={(file) => read(file)} dragging={dragging} onDragState={setDragging} disabled={busy} />
          <ChoiceCards googleOpen={googleOpen} onConnectGoogle={() => setGoogleOpen((open) => !open)} manualOpen={manualOpen} onManual={() => setManualOpen((open) => !open)} />
        </div>
        {busy && <p role="status" className="muted">Reading your file…</p>}
        {manualOpen && <div className="add-google">{manualSlot}</div>}
        {googleOpen && <div className="add-google">{googleSlot}</div>}
      </>}

      {phase.step === "check" && (
        <form key={phase.read.id} className="add-check" noValidate aria-busy={busy}
          onSubmit={(event) => send(event, phase.read)}
          onChange={(event) => setSelection(countSelection(new FormData(event.currentTarget), labels))}>
          <p className="muted">{phase.read.file.name}</p>
          {phase.read.sheets.length > 1 && <label className="form-field"><span>Which sheet?</span>
            <select className="field" value={phase.read.sheet} disabled={busy} onChange={(event) => { event.stopPropagation(); read(phase.read.file, event.target.value); }}>
              {phase.read.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}
            </select></label>}
          {(() => {
            const groups = previewColumns(phase.read.headers, phase.read.fields);
            return <CheckSummary summary={summaryLine(counts)} held={heldLine(counts)} headers={groups.map((group) => group.title)}
              rows={phase.read.rows.map((cells, index) => ({ cells: groups.map((group) => previewCell(cells, group.columns)), label: labels[index]?.label }))} />;
          })()}
          <details ref={adjust} className="add-adjust" open={needsAttention({ fields: phase.read.fields, labels: phase.read.labels, customers: customers.length })}>
            <summary>Check columns and rows</summary>
            <ImportSelector headers={phase.read.headers} rows={phase.read.rows} labels={phase.read.labels} fields={phase.read.fields} customers={customers}
              saved={customers.length === 1 ? { customerId: customers[0].id } : undefined} disabled={busy}
              onLabels={(next) => { setLabels(next); setSelection(null); }} />
          </details>
          <div className="add-done-actions" style={{ justifyContent: "flex-start" }}>
            <button className="add-button" disabled={!canSend({ busy, rows: sendable })}>{busy ? "Sending…" : `Send ${sendable} ${sendable === 1 ? "row" : "rows"} to review`}</button>
            <button type="button" className="add-button secondary" disabled={busy} onClick={again}>Choose a different file</button>
          </div>
        </form>
      )}

      {phase.step === "done" && (phase.fresh
        ? <DoneState count={phase.fresh} reviewHref="/imports" onAddMore={again} skipped={phase.skipped} />
        : <div className="add-done" role="status">
          <h2 tabIndex={-1} data-step-focus>{phase.already ? "These rows were already sent" : "No new rows were added"}</h2>
          <p>{phase.already ? "They're waiting in the Review Inbox." : "Nothing new was found in this file."}</p>
          {phase.skipped > 0 && <p className="add-note">{phase.skipped} {phase.skipped === 1 ? "row was" : "rows were"} skipped. Check {phase.skipped === 1 ? "it" : "them"} in your file.</p>}
          <div className="add-done-actions"><a className="add-button" href="/imports">Open the Review Inbox</a><button type="button" className="add-button secondary" onClick={again}>Add more records</button></div>
        </div>)}
    </div>
  );
}
