"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inspectCsvAction, previewCsvAction, stageCsvAction, createCsvSourceAction } from "@/app/(workspace)/imports/actions";
import type { CsvMapping, CsvRow } from "@/lib/domain/imports";
import type { IntakeSource, IntakeBatchResult } from "@/lib/server/intake";
import { Field } from "./command-form";

export type MappingKind = "invoice" | "expense" | "mixed";

/** Column-mapping inputs shared by file imports and connected Sheets. Field names are read by `readMappingForm`. */
export function ImportMappingFields({ headers, customers, kind, onKindChange, disabled = false, defaults = {} }: { headers: string[]; customers: { id: string; name: string }[]; kind: MappingKind; onKindChange: (kind: MappingKind) => void; disabled?: boolean; defaults?: Record<string, unknown> }) {
  // Preselect a saved mapping only where its column still exists, so a renamed column must be chosen again.
  const saved = (name: string) => typeof defaults[name] === "string" && headers.includes(defaults[name] as string) ? defaults[name] as string : "";
  const savedList = (name: string) => Array.isArray(defaults[name]) ? (defaults[name] as unknown[]).filter(value => typeof value === "string").join(", ") : "";
  const filter = (defaults.filter && typeof defaults.filter === "object" ? defaults.filter : {}) as { column?: unknown; value?: unknown };
  const selectColumn = (name: string, label: string, required = true) => <label className="form-field"><span>{label}</span><select className="field" name={name} required={required} disabled={disabled} defaultValue={saved(name)}><option value="">{required ? "Select a column" : "Not mapped"}</option>{headers.map(header => <option key={header}>{header}</option>)}</select></label>;
  return <div className="intake-form-grid">
    <label className="form-field"><span>Record kind</span><select className="field" value={kind} disabled={disabled} onChange={event => onKindChange(event.target.value as MappingKind)}><option value="invoice">Customer invoices</option><option value="expense">Upcoming expenses</option><option value="mixed">Mixed (by Type column)</option></select></label>
    {selectColumn("externalId", "Stable source row ID")}
    {kind === "mixed" && <>{selectColumn("typeColumn", "Type column")}<Field name="invoiceValues" label="Values meaning invoice" placeholder="Invoice, Receivable, AR" required disabled={disabled} maxLength={1000} defaultValue={savedList("invoiceValues")} /><Field name="expenseValues" label="Values meaning expense" placeholder="Bill, Payable, AP" required disabled={disabled} maxLength={1000} defaultValue={savedList("expenseValues")} /></>}
    {kind !== "expense" && <>{selectColumn("number", "Invoice number")}<label className="form-field"><span>Customer for rows without a customer ID</span><select name="customerId" className="field" required disabled={disabled} defaultValue={customers.some(customer => customer.id === defaults.customerId) ? defaults.customerId as string : ""}><option value="">Select an existing customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><small>Create missing customers using the existing invoice page.</small></label>{selectColumn("customer", "Existing PondoPath customer ID (optional)", false)}</>}
    {kind !== "invoice" && <>{selectColumn("label", "Expense label")}{selectColumn("payee", "Payee / supplier")}</>}
    {selectColumn("amount", "Total amount (PHP)")}{selectColumn("dueDate", "Original due date (YYYY-MM-DD)")}{selectColumn("recordId", "Existing PondoPath record ID (optional)", false)}{selectColumn("currency", "Currency column (optional; PHP only)", false)}
    <label className="form-field"><span>Only include rows where (optional)</span><select className="field" name="filterColumn" disabled={disabled} defaultValue={typeof filter.column === "string" && headers.includes(filter.column) ? filter.column : ""}><option value="">Include every row</option>{headers.map(header => <option key={header}>{header}</option>)}</select></label>
    <Field name="filterValue" label="equals" placeholder="Unpaid" disabled={disabled} maxLength={200} defaultValue={typeof filter.value === "string" ? filter.value : ""} />
  </div>;
}

/** Builds a mapping from `ImportMappingFields`; the server validates it with `csvMappingSchema`. */
export function readMappingForm(data: FormData, kind: MappingKind): CsvMapping {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const optional = (key: string) => text(key) ? { [key]: text(key) } : {};
  const list = (key: string) => text(key).split(",").map(item => item.trim()).filter(Boolean);
  const base = { externalId: text("externalId"), amount: text("amount"), dueDate: text("dueDate"), ...optional("recordId"), ...optional("currency"),
    ...(text("filterColumn") ? { filter: { column: text("filterColumn"), value: text("filterValue") } } : {}) };
  const invoice = { number: text("number"), customerId: text("customerId"), ...optional("customer") };
  const expense = { label: text("label"), payee: text("payee") };
  if (kind === "invoice") return { ...base, kind, ...invoice };
  if (kind === "expense") return { ...base, kind, ...expense };
  return { ...base, kind, typeColumn: text("typeColumn"), invoiceValues: list("invoiceValues"), expenseValues: list("expenseValues"), ...invoice, ...expense };
}

export function CsvImport({ sources, customers, owner }: { sources: IntakeSource[]; customers: { id: string; name: string }[]; owner: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [sourceId, setSourceId] = useState(sources.find(source => ["manual_csv", "manual_xlsx"].includes(source.kind))?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [kind, setKind] = useState<MappingKind>("invoice");
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [results, setResults] = useState<IntakeBatchResult | null>(null);
  const [notice, setNotice] = useState("");
  const makeForm = (map?: CsvMapping) => { const form = new FormData(); if (file) form.set("file", file); form.set("sourceId", sourceId); if (sheet) form.set("sheet", sheet); if (map) form.set("mapping", JSON.stringify(map)); return form; };
  return <section className="records-panel" id="csv-import" aria-labelledby="csv-title">
    <div className="records-head"><div><h2 id="csv-title">Import a spreadsheet</h2><p>1. Choose a source and file → 2. Map and preview → 3. Send to review</p></div></div>
    <div className="intake-panel-body">
      <p className="muted">UTF-8 CSV or XLSX · up to 512 KiB, 100 rows and 24 columns per import. Use PHP amounts and YYYY-MM-DD due dates. Imports prepare invoice or expense proposals; they never record a payment.</p>
      <p className="muted">For Excel, choose one worksheet and use plain values: formulas and linked workbooks are not supported. Store row IDs and invoice numbers as Text to preserve leading zeros.</p>
      <p><a href="/samples/pondopath-invoices.csv" download className="text-link">Download a fictional invoice CSV</a> · <a href="/samples/pondopath-invoices.xlsx" download className="text-link">Download the Excel version</a></p>
      {owner && <details><summary>Create a spreadsheet source</summary><form className="intake-source-form" onSubmit={event => { event.preventDefault(); const label = String(new FormData(event.currentTarget).get("label") ?? ""); start(async () => { const result = await createCsvSourceAction(label); if (result.ok) { setSourceId(result.data); setNotice("Source created. Reuse this source for future versions of the same spreadsheet, whether saved as CSV or Excel."); router.refresh(); } else setNotice(result.message); }); }}><Field name="label" label="Source name" disabled={busy} placeholder="Customer invoice spreadsheet" required maxLength={200} /><button disabled={busy} className="button secondary">Create source</button></form></details>}
      <form className="intake-upload-form" onSubmit={event => { event.preventDefault(); setRows(null); setResults(null); setNotice(""); start(async () => { const result = await inspectCsvAction(makeForm()); if (result.ok) { setHeaders(result.data.headers); setSheets(result.data.sheets); setNotice(result.data.sheets.length && !result.data.sheet ? "Choose a worksheet, then read its columns." : `${result.data.count} rows found. Map the columns below.`); } else setNotice(result.message); }); }}>
        <label className="form-field"><span>Spreadsheet source</span><select className="field" value={sourceId} disabled={busy} onChange={event => { setSourceId(event.target.value); setRows(null); setResults(null); }} required><option value="">Select a source</option>{sources.filter(source => ["manual_csv", "manual_xlsx"].includes(source.kind)).map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select><small>Reuse the same source and stable row IDs to avoid duplicate records, including when the spreadsheet moves between CSV and Excel.</small></label>
        <Field type="file" label="Spreadsheet file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setHeaders([]); setSheets([]); setSheet(""); setMapping(null); setRows(null); setResults(null); setNotice(""); }} />
        {!!sheets.length && <label className="form-field"><span>Worksheet</span><select className="field" value={sheet} disabled={busy} required onChange={event => { setSheet(event.target.value); setHeaders([]); setMapping(null); setRows(null); setResults(null); setNotice(""); }}><option value="">Select a worksheet</option>{sheets.map(name => <option key={name}>{name}</option>)}</select></label>}
        <button className="button secondary" disabled={busy || !sourceId || !file}>{busy ? "Reading…" : "Read columns"}</button>
      </form>
      {!sources.length && <p className="muted">{owner ? "Create a source above to start." : "Ask the owner to create a spreadsheet source. You can then import files and review proposals."}</p>}
      {!!headers.length && <form key={`${file?.name}:${kind}`} onChange={() => { setRows(null); setResults(null); }} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        const selected = readMappingForm(data, kind);
        setMapping(selected); setNotice(""); start(async () => { const result = await previewCsvAction(makeForm(selected)); if (result.ok) setRows(result.data); else setNotice(result.message); });
      }}>
        <ImportMappingFields headers={headers} customers={customers} kind={kind} onKindChange={setKind} disabled={busy} />
        <button className="button secondary" disabled={busy}>Preview rows</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
      {rows && <div className="intake-preview">
        <h3>Row preview</h3><p className="muted">{rows.filter(row => row.candidate && !["invalid", "duplicate"].includes(row.status)).length} valid rows · Invalid and duplicate rows stay out. Unchanged rows are checked again when staged. Missing rows never delete saved records.</p>
        <div className="intake-table-scroll"><table className="intake-table"><thead><tr><th>Row / source ID</th><th>Result</th><th>Proposed values</th><th>Details</th></tr></thead><tbody>{rows.map(row => <tr key={row.row}><th scope="row">{row.row} · {row.externalId || "Missing ID"}</th><td>{row.status.replaceAll("_", " ")}</td><td>{row.candidate ? <>{row.candidate.type === "save_invoice" ? row.candidate.payload.number : row.candidate.payload.label}<br />PHP {(row.candidate.payload.amountCents / 100).toFixed(2)} · {row.candidate.payload.dueDate}</> : "Not accepted"}</td><td>{row.message}</td></tr>)}</tbody></table></div>
        <button className="button" disabled={busy || !mapping || !rows.some(row => row.candidate && !["invalid", "duplicate"].includes(row.status))} onClick={() => start(async () => { const result = await stageCsvAction(makeForm(mapping!)); if (result.ok) { setResults(result.data); setNotice("Rows processed. Open each pending item below to review and confirm it."); router.refresh(); } else setNotice(result.message); })}>{busy ? "Preparing proposals…" : "Send valid rows to Review Inbox"}</button>
      </div>}
      {results && <div role="status"><h3>Import results</h3><ul>{results.map((result, index) => <li key={index}>{result.externalId}: {result.status.replaceAll("_", " ")}{result.replayed ? " · previously received; no duplicate" : ""}{result.itemId && ["pending", "needs_match"].includes(result.status) ? <> · <a href={`/imports?item=${result.itemId}#item-${result.itemId}`}>Review proposal</a></> : null}{result.code ? ` · ${result.code}` : ""}</li>)}</ul></div>}
    </div>
  </section>;
}
