"use client";

import Link from "next/link";
import { useRef } from "react";
import type { RowLabel } from "@/lib/domain/reader";

type IconName = "upload" | "file" | "table" | "pencil" | "check" | "download" | "alert";
const PATHS: Record<IconName, React.ReactNode> = {
  upload: <><path d="M12 15V4" /><path d="M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h8M12 11v8" /></>,
  table: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  download: <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[name]}</svg>;
}

const STEPS = [["file", "File"], ["check", "Check"], ["done", "Done"]] as const;
export type AddStep = (typeof STEPS)[number][0];

export function StepIndicator({ step }: { step: AddStep }) {
  const current = STEPS.findIndex(([key]) => key === step);
  return (
    <ol className="add-steps" aria-label="Import steps">
      {STEPS.map(([key, label], index) => {
        const done = index < current || step === "done";
        return (
          <li key={key} className={done ? "done" : index === current ? "current" : undefined} aria-current={index === current ? "step" : undefined}>
            <span className="add-step-dot">{done ? <Icon name="check" size={13} /> : index + 1}</span>
            <span>{label}</span>{done && <span className="sr-only">, done</span>}
          </li>
        );
      })}
    </ol>
  );
}

const ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function DropArea({ onFile, dragging = false, fileName, disabled = false, onDragState }: {
  onFile: (file: File) => void; dragging?: boolean; fileName?: string; disabled?: boolean; onDragState?: (dragging: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`add-drop${dragging ? " over" : ""}`}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); onDragState?.(true); } }}
      onDragLeave={() => onDragState?.(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        onDragState?.(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
    >
      <span className="add-drop-icon"><Icon name={dragging ? "file" : "upload"} size={24} /></span>
      {dragging
        ? <><p className="add-drop-title">Release to add your file</p>{fileName && <p className="add-drop-name">{fileName}</p>}</>
        : <>
          <p className="add-drop-title">Drop your Excel or CSV file here</p>
          <p className="add-drop-or">or</p>
          <button type="button" className="add-button" data-step-focus disabled={disabled} onClick={() => input.current?.click()}>
            <span className="add-wide">Choose file</span><span className="add-narrow">Choose your Excel or CSV file</span>
          </button>
          <a className="add-link" href="/samples/pondopath-mixed.csv" download><Icon name="download" size={14} />Try a sample file</a>
        </>}
      <input ref={input} className="sr-only" type="file" accept={ACCEPT} tabIndex={-1} aria-hidden="true"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
    </div>
  );
}

export function ChoiceCards({ googleOpen, onConnectGoogle, manualHref }: { googleOpen: boolean; onConnectGoogle: () => void; manualHref: string }) {
  return (
    <div className="add-choices">
      <button type="button" className="add-card" aria-expanded={googleOpen} onClick={onConnectGoogle}>
        <span className="add-card-icon"><Icon name="table" /></span>
        <span><strong>Connect Google Sheet</strong><small>Keeps itself up to date</small></span>
      </button>
      <Link className="add-card" href={manualHref}>
        <span className="add-card-icon"><Icon name="pencil" /></span>
        <span><strong>Type it in</strong><small>One record at a time</small></span>
      </Link>
    </div>
  );
}

export type PreviewRow = { cells: string[]; label?: RowLabel };
const CHIP: Partial<Record<RowLabel, string>> = { invoice: "Invoice", expense: "Expense", payment: "Payment", choose: "Needs you" };

export function CheckSummary({ summary, held, headers, rows }: { summary: string; held: string; headers: string[]; rows: PreviewRow[] }) {
  const columns = headers.slice(0, 4);
  return (
    <div className="add-check">
      <p className="add-summary" tabIndex={-1} data-step-focus>{summary}</p>
      <div className="add-table-scroll">
        <table className="add-table">
          <thead><tr>{columns.map((header) => <th key={header} scope="col">{header}</th>)}<th scope="col">Type</th></tr></thead>
          <tbody>{rows.slice(0, 5).map((row, index) => (
            <tr key={index}>{columns.map((_, column) => <td key={column}>{row.cells[column] ?? ""}</td>)}
              <td>{row.label && <span className={`add-chip ${row.label}`}>{CHIP[row.label]}</span>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {held && <p className="add-note"><Icon name="alert" size={16} />{held}</p>}
    </div>
  );
}

export function DoneState({ count, reviewHref, onAddMore, skipped = 0 }: { count: number; reviewHref: string; onAddMore: () => void; skipped?: number }) {
  return (
    <div className="add-done" role="status">
      <span className="add-done-check"><Icon name="check" size={34} /></span>
      <h2 tabIndex={-1} data-step-focus>{count} {count === 1 ? "row is" : "rows are"} ready to review</h2>
      <p>Nothing is saved yet.</p>
      {skipped > 0 && <p className="add-note">{skipped} {skipped === 1 ? "row was" : "rows were"} skipped. Check {skipped === 1 ? "it" : "them"} in your file.</p>}
      <div className="add-done-actions">
        <Link className="add-button" href={reviewHref}>Review now</Link>
        <button type="button" className="add-button secondary" onClick={onAddMore}>Add more records</button>
      </div>
    </div>
  );
}
