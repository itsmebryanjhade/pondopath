"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inspectCsvAction, previewCsvAction, stageCsvAction, createCsvSourceAction } from "@/app/(workspace)/imports/actions";
import type { CsvMapping, CsvRow } from "@/lib/domain/imports";
import type { IntakeSource, IntakeBatchResult } from "@/lib/server/intake";
import { Field } from "./command-form";

export function CsvImport({ sources, customers, owner }: { sources: IntakeSource[]; customers: { id: string; name: string }[]; owner: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [sourceId, setSourceId] = useState(sources.find(source => source.kind === "manual_csv")?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [kind, setKind] = useState<"invoice" | "expense">("invoice");
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [results, setResults] = useState<IntakeBatchResult | null>(null);
  const [notice, setNotice] = useState("");
  const makeForm = (map?: CsvMapping) => { const form = new FormData(); if (file) form.set("file", file); form.set("sourceId", sourceId); if (map) form.set("mapping", JSON.stringify(map)); return form; };
  const selectColumn = (name: string, label: string, required = true) => <label className="form-field"><span>{label}</span><select className="field" name={name} required={required} defaultValue=""><option value="">{required ? "Select a column" : "Not mapped"}</option>{headers.map(header => <option key={header}>{header}</option>)}</select></label>;
  return <section className="records-panel" id="csv-import" aria-labelledby="csv-title">
    <div className="records-head"><div><h2 id="csv-title">Import a CSV</h2><p>1. Choose a source and file → 2. Map and preview → 3. Send to review</p></div></div>
    <div className="intake-panel-body">
      <p className="muted">UTF-8 CSV · up to 512 KiB, 100 rows and 24 columns. Use PHP amounts and YYYY-MM-DD due dates. Imports prepare invoice or expense proposals; they never record a payment.</p>
      <p><a href="/samples/pondopath-invoices.csv" download className="text-link">Download a fictional invoice CSV</a></p>
      {owner && <details><summary>Create a CSV source</summary><form className="intake-source-form" onSubmit={event => { event.preventDefault(); const label = String(new FormData(event.currentTarget).get("label") ?? ""); start(async () => { const result = await createCsvSourceAction(label); if (result.ok) { setSourceId(result.data); setNotice("Source created. Reuse this source for future versions of the same spreadsheet."); router.refresh(); } else setNotice(result.message); }); }}><Field name="label" label="Source name" placeholder="Customer invoice spreadsheet" required maxLength={200} /><button disabled={busy} className="button secondary">Create source</button></form></details>}
      <form className="intake-upload-form" onSubmit={event => { event.preventDefault(); setRows(null); setResults(null); setNotice(""); start(async () => { const result = await inspectCsvAction(makeForm()); if (result.ok) { setHeaders(result.data.headers); setNotice(`${result.data.count} rows found. Map the columns below.`); } else setNotice(result.message); }); }}>
        <label className="form-field"><span>CSV source</span><select className="field" value={sourceId} onChange={event => { setSourceId(event.target.value); setRows(null); setResults(null); }} required><option value="">Select a source</option>{sources.filter(source => source.kind === "manual_csv").map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select><small>Reuse the same source and stable row IDs to avoid duplicate records.</small></label>
        <Field type="file" label="CSV file" accept=".csv,text/csv" required onChange={event => { setFile(event.target.files?.[0] ?? null); setHeaders([]); setRows(null); setResults(null); setNotice(""); }} />
        <button className="button secondary" disabled={busy || !sourceId || !file}>{busy ? "Reading…" : "Read columns"}</button>
      </form>
      {!sources.length && <p className="muted">{owner ? "Create a source above to start." : "Ask the owner to create a CSV source. You can then import files and review proposals."}</p>}
      {!!headers.length && <form key={`${file?.name}:${kind}`} onChange={() => { setRows(null); setResults(null); }} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        const base = { kind, externalId: String(data.get("externalId")), amount: String(data.get("amount")), dueDate: String(data.get("dueDate")), ...(data.get("recordId") ? { recordId: String(data.get("recordId")) } : {}), ...(data.get("currency") ? { currency: String(data.get("currency")) } : {}) };
        const selected: CsvMapping = kind === "invoice" ? { ...base, kind: "invoice", number: String(data.get("number")), customerId: String(data.get("customerId")), ...(data.get("customer") ? { customer: String(data.get("customer")) } : {}) } : { ...base, kind: "expense", label: String(data.get("label")), payee: String(data.get("payee")) };
        setMapping(selected); setNotice(""); start(async () => { const result = await previewCsvAction(makeForm(selected)); if (result.ok) setRows(result.data); else setNotice(result.message); });
      }}>
        <div className="intake-form-grid">
          <label className="form-field"><span>Record kind</span><select className="field" value={kind} onChange={event => setKind(event.target.value as "invoice" | "expense")}><option value="invoice">Customer invoices</option><option value="expense">Upcoming expenses</option></select></label>
          {selectColumn("externalId", "Stable source row ID")}
          {kind === "invoice" ? <>{selectColumn("number", "Invoice number")}<label className="form-field"><span>Customer for rows without a customer ID</span><select name="customerId" className="field" required defaultValue=""><option value="">Select an existing customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><small>Create missing customers using the existing invoice page.</small></label>{selectColumn("customer", "Existing PondoPath customer ID (optional)", false)}</> : <>{selectColumn("label", "Expense label")}{selectColumn("payee", "Payee / supplier")}</>}
          {selectColumn("amount", "Total amount (PHP)")}{selectColumn("dueDate", "Original due date (YYYY-MM-DD)")}{selectColumn("recordId", "Existing PondoPath record ID (optional)", false)}{selectColumn("currency", "Currency column (optional; PHP only)", false)}
        </div>
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
