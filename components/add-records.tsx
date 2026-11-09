"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ensureFileSourceAction, inspectCsvAction, previewCsvAction, stageCsvAction } from "@/app/(workspace)/imports/actions";
import { countLabels, fileKind, heldLine, plainImportError, previewCell, previewColumns, summarizeOutcome, summaryLine } from "@/lib/domain/add-records";
import type { AutoFields } from "@/lib/domain/reader";
import type { CsvMapping } from "@/lib/domain/imports";
import { takePendingFile } from "@/lib/ui/pending-file";
import { PENDING_FILE_EVENT } from "@/lib/ui/pending-file-event";
import { CheckSummary, ChoiceCards, DoneState, DropArea, StepIndicator, WorkbookSheetPicker } from "./add-records-parts";
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

type WorkbookPreview = { held: { payments: number[]; choose: number[] }; groups: { sheet: string; readyCount: number; readyCents: number; exceptionCount: number; excludedOpenCount: number; excludedOpenCents: number; exceptions: { row: number; externalId: string; status: string; message: string }[] }[]; previewStatuses: string[]; hasSendable: boolean };
type Read = { id: number; sourceId: string; file: File; sheets: string[]; selectedSheets: string[]; headers: string[]; rows: (string | number | boolean | null)[][]; fields: AutoFields; labels: SelectorLabel[]; preview?: WorkbookPreview };
type Phase = { step: "file" } | { step: "check"; read: Read } | { step: "done"; fresh: number; already: number; skipped: number };

export function AddRecords({ customers, googleSlot, manualSlot, googleOpenAtStart = false, manualOpenAtStart = false, revision }: { customers: { id: string; name: string }[]; googleSlot: ReactNode; manualSlot?: ReactNode; googleOpenAtStart?: boolean; manualOpenAtStart?: boolean; revision?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const busyRef = useRef(false);
  const [helpPending, setHelpPending] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "file" });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(googleOpenAtStart);
  const [manualOpen, setManualOpen] = useState(manualOpenAtStart);
  const [labels, setLabels] = useState<SelectorLabel[]>([]);
  const [selection, setSelection] = useState<{ invoice: number; expense: number } | null>(null);
  const adjust = useRef<HTMLDetailsElement>(null);
  const readCount = useRef(0);
  const shown = useRef(phase.step);

  const requestMappingHelp = async () => {
    if (helpPending || phase.step !== "check" || phase.read.headers.length === 0) return;
    setHelpPending(true);
    try {
      const headers = phase.read.headers.slice(0, 24).map((h, i) => ({ id: `c${i}`, name: h.slice(0, 40) }));
      const headerNames = new Map(headers.map(h => [h.id, h.name]));
      const samples = phase.read.rows.slice(0, 3).map(row => row.slice(0, 24).map(v => v === null ? "" : String(v).slice(0, 80)));
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "suggest_import_mapping",
          headers,
          samples,
          expectedRevision: revision ?? 1,
          language: "auto",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.proposal?.fields) {
          const nextFields: AutoFields = { ...phase.read.fields };
          for (const [key, colId] of Object.entries(data.proposal.fields)) {
            if (colId && headerNames.has(colId as string)) {
              nextFields[key as keyof AutoFields] = headerNames.get(colId as string);
            }
          }
          setPhase(value => value.step === "check" ? { step: "check", read: { ...value.read, fields: nextFields, preview: undefined } } : value);
        }
      }
    } catch {
      // Keep manual mapping
    } finally {
      setHelpPending(false);
    }
  };

  const read = useCallback((file: File, selectedSheets: string[] = []) => start(async () => {
    setError("");
    const kind = fileKind(file.name);
    if (!kind) { setError("Only Excel (.xlsx) and CSV files can be added."); return; }
    const source = await ensureFileSourceAction();
    if (!source.ok) { setError(describeFailure(source.message)); return; }
    const inspect = (names: string[]) => {
      const form = new FormData();
      form.set("file", file); form.set("sourceId", source.data);
      names.forEach(name => form.append("sheet", name));
      return inspectCsvAction(form);
    };
    let result = await inspect(selectedSheets);
    if (result.ok && kind === "xlsx" && !selectedSheets.length && result.data.sheets.length === 1) result = await inspect(result.data.sheets);
    if (result.ok && kind === "xlsx" && !selectedSheets.length && result.data.sheets.length > 1) {
      setLabels([]); setSelection(null);
      setPhase({ step: "check", read: { id: ++readCount.current, sourceId: source.data, file, sheets: result.data.sheets, selectedSheets: result.data.sheets, headers: [], rows: [], fields: {}, labels: [] } });
      return;
    }
    if (!result.ok) { setError(describeFailure(result.message)); return; }
    const { headers, rows, fields, labels: found, sheets, selectedSheets: loadedSheets } = result.data;
    setLabels(found);
    setSelection(null);
    setPhase({ step: "check", read: { id: ++readCount.current, sourceId: source.data, file, sheets, selectedSheets: loadedSheets, headers, rows: rows as Read["rows"], fields, labels: found } });
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
    current.selectedSheets.forEach(sheet => form.append("sheet", sheet));
    start(async () => {
      setError("");
      if (!current.preview) {
        const preview = await previewCsvAction(form);
        if (!preview.ok) { setError(describeFailure(preview.message)); return; }
        setPhase({ step: "check", read: { ...current, preview: preview.data } });
        return;
      }
      const staged = await stageCsvAction(form);
      if (!staged.ok) { setError(describeFailure(staged.message)); return; }
      const outcome = summarizeOutcome(current.preview.previewStatuses, staged.data);
      setPhase({ step: "done", ...outcome });
      if (outcome.fresh) toast.show(`${outcome.fresh} ${outcome.fresh === 1 ? "row" : "rows"} ready to review`, { label: "Review", href: "/imports" });
      router.refresh();
    });
  };

  const counts = countLabels(labels);
  const picked = selection ?? { invoice: counts.invoice, expense: counts.expense };
  const sendable = picked.invoice + picked.expense;
  const readyCount = phase.step === "check" ? (phase.read.preview?.groups.reduce((total, group) => total + group.readyCount, 0) ?? 0) : 0;
  const exceptionsCount = phase.step === "check" ? (phase.read.preview?.groups.reduce((total, group) => total + group.exceptionCount, 0) ?? 0) : 0;
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
          onChange={(event) => {
            setSelection(countSelection(new FormData(event.currentTarget), labels));
            setPhase(value => value.step === "check" && value.read.preview ? { step: "check", read: { ...value.read, preview: undefined } } : value);
          }}>
          <p className="muted">{phase.read.file.name}</p>
          {phase.read.sheets.length > 1 && <WorkbookSheetPicker sheets={phase.read.sheets} selected={phase.read.selectedSheets} disabled={busy}
            onToggle={(sheet, checked) => { setPhase(value => value.step === "check" ? { step: "check", read: { ...value.read, selectedSheets: checked ? [...value.read.selectedSheets, sheet] : value.read.selectedSheets.filter(item => item !== sheet), preview: undefined } } : value); setSelection(null); }}
            onRead={() => read(phase.read.file, phase.read.selectedSheets)} />}
          {phase.read.headers.length > 0 && (() => {
            const groups = previewColumns(phase.read.headers, phase.read.fields);
            return <CheckSummary summary={phase.read.preview ? `${readyCount} rows ready to review across ${phase.read.preview.groups.length} sheets.` : summaryLine(counts)}
              held={[heldLine(counts), exceptionsCount ? `${exceptionsCount} rows need attention; see sheet totals.` : ""].filter(Boolean).join(" ")}
              headers={groups.map((group) => group.title)} groups={phase.read.preview?.groups}
              rows={phase.read.rows.slice(0, 5).map((cells, index) => ({ cells: groups.map((group) => previewCell(cells, group.columns)), label: labels[index]?.label }))} />;
          })()}
          {phase.read.headers.length > 0 && <details ref={adjust} className="add-adjust" open={needsAttention({ fields: phase.read.fields, labels: phase.read.labels, customers: customers.length })}>
            <summary>Check columns and rows</summary>
            <ImportSelector headers={phase.read.headers} rows={phase.read.rows} labels={phase.read.labels} fields={phase.read.fields} customers={customers}
              saved={customers.length === 1 ? { customerId: customers[0].id } : undefined} disabled={busy || helpPending}
              onLabels={(next) => { setLabels(next); setSelection(null); setPhase(value => value.step === "check" ? { step: "check", read: { ...value.read, preview: undefined } } : value); }}
              onHelpMatchColumns={requestMappingHelp} />
          </details>}
          <div className="add-done-actions" style={{ justifyContent: "flex-start" }}>
            {phase.read.headers.length > 0 && <button className="add-button" disabled={!canSend({ busy, rows: phase.read.preview ? Number(phase.read.preview.hasSendable) : sendable })}>{busy ? "Working…" : phase.read.preview ? `Send ${readyCount} ${readyCount === 1 ? "row" : "rows"} to review` : `Review ${sendable} ${sendable === 1 ? "row" : "rows"}`}</button>}
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
