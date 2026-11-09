"use client";

import { useRef, useState } from "react";
import { labelRows, type AutoFields, type AutoMapping, type RowLabel } from "@/lib/domain/reader";

export type SelectorLabel = { row: number; externalId: string; label: RowLabel; reason: string };
type Customer = { id: string; name: string };

const ID_MESSAGE = "Pick the column that names each row, like an invoice or reference number. It stops an edited row from being added twice.";
const ROLE_FIELDS: { name: keyof AutoFields; label: string; required: boolean }[] = [
  { name: "externalId", label: "Which column names each row?", required: true },
  { name: "amount", label: "Amount (PHP)", required: true },
  { name: "dueDate", label: "Due date", required: true },
  { name: "number", label: "Invoice number", required: true },
  { name: "customer", label: "Customer column (optional)", required: false },
  { name: "payee", label: "Supplier / payee column", required: true },
  { name: "label", label: "Description / expense label", required: true },
  { name: "typeColumn", label: "Type column (optional)", required: false },
  { name: "paidAmount", label: "Already paid (optional)", required: false },
  { name: "openBalance", label: "Open balance (optional)", required: false },
  { name: "status", label: "Payment status (optional)", required: false },
];

/** Column/row selector with the reader's labels. Field names are read by `readSelectorForm`; the server validates the result. */
/** Labels the shown rows again from the column choices currently in the form, so the screen matches what a sync will do. */
export function relabel(headers: string[], rows: (string | number | boolean | null)[][], data: FormData, rowNumbers?: number[]): SelectorLabel[] {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const optional = (key: "customer" | "payee" | "label" | "typeColumn") => text(key) ? { [key]: text(key) } : {};
  const file = { headers, rows: rows.map(row => row.map(value => value === null ? "" : String(value))), rowNumbers: rowNumbers ?? rows.map((_, index) => index + 2) };
  return labelRows(file, { externalId: text("externalId"), amount: text("amount"), overrides: {}, ...optional("customer"), ...optional("payee"), ...optional("label"), ...optional("typeColumn") });
}

export function ImportSelector({ headers, rows, labels: initial, fields, customers, saved, disabled = false, onLabels, onHelpMatchColumns }: {
  headers: string[]; rows: (string | number | boolean | null)[][]; labels: SelectorLabel[]; fields: AutoFields; customers: Customer[]; saved?: Partial<AutoMapping>; disabled?: boolean;
  onLabels?: (labels: SelectorLabel[]) => void;
  onHelpMatchColumns?: () => Promise<AutoFields | undefined>;
}) {
  const table = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(initial);
  const updateLabels = (data: FormData) => {
    const next = relabel(headers, rows, data, initial.map(item => item.row));
    setLabels(next); onLabels?.(next);
  };
  const roleChanged = (event: React.ChangeEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.form || !ROLE_FIELDS.some(field => field.name === target.name)) return;
    updateLabels(new FormData(target.form));
  };
  const applySuggestions = async (form: HTMLFormElement | null) => {
    if (!form || !onHelpMatchColumns) return;
    const data = new FormData(form);
    const suggestions = await onHelpMatchColumns();
    if (!suggestions || !form.isConnected) return;
    for (const { name } of ROLE_FIELDS) {
      const column = suggestions[name];
      const select = form.elements.namedItem(name);
      if (column && select instanceof HTMLSelectElement && headers.includes(column)) {
        select.value = column;
        data.set(name, column);
      }
    }
    updateLabels(data);
  };
  const pick = (name: keyof AutoFields) => { const value = (saved?.[name] as string | undefined) ?? fields[name]; return value && headers.includes(value) ? value : ""; };
  const columnOn = (header: string) => !saved?.columns || saved.columns.includes(header);
  const rowOn = (id: string) => !saved?.excludedIds?.includes(id);
  const selectAll = () => table.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(box => { box.checked = true; });
  return <div className="import-selector">
    <div className="intake-form-grid" onChange={roleChanged}>
      {ROLE_FIELDS.map(field => <label key={field.name} className="form-field"><span>{field.label}</span>
        <select className="field" name={field.name} required={field.required} disabled={disabled} defaultValue={pick(field.name)}>
          <option value="">{field.required ? "Select a column" : "Not used"}</option>{headers.map(header => <option key={header}>{header}</option>)}
        </select></label>)}
      <label className="form-field"><span>Customer for invoice rows without a customer</span>
        <select name="customerId" className="field" required disabled={disabled} defaultValue={customers.some(customer => customer.id === saved?.customerId) ? saved!.customerId : ""}>
          <option value="">Select an existing customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select><small>Create missing customers using the existing invoice page.</small></label>
    </div>
    {onHelpMatchColumns && (
      <div className="import-help-action" style={{ margin: "8px 0" }}>
        <button type="button" className="button secondary" disabled={disabled} onClick={event => void applySuggestions(event.currentTarget.form)}>
          Help match columns
        </button>
      </div>
    )}
    <p className="muted">PondoPath labelled each row. Untick anything you do not want, and change a label if it is wrong. Payment rows are never imported as cash.</p>
    <button type="button" className="button secondary" disabled={disabled} onClick={selectAll}>Select all</button>
    <div className="intake-table-scroll" ref={table}><table className="intake-table">
      <thead><tr><th scope="col">Include</th>{headers.map(header => <th key={header} scope="col">
        <label><input type="checkbox" name="column" value={header} defaultChecked={columnOn(header)} disabled={disabled} aria-label={`Include column ${header}`} /> {header}</label></th>)}<th scope="col">Label</th></tr></thead>
      <tbody>{labels.map((item, index) => <tr key={`${item.row}:${item.externalId}`}>
        <td><input type="hidden" name="rowId" value={item.externalId} />{item.label === "payment" ? "—" :
          <input type="checkbox" name="row" value={item.externalId} defaultChecked={rowOn(item.externalId)} disabled={disabled} aria-label={`Include row ${item.externalId || item.row}`} />}</td>
        {headers.map((header, column) => <td key={header}>{String(rows[index]?.[column] ?? "")}</td>)}
        <td>{item.label === "payment" ? <strong>Payment — record it in Collections</strong> :
          <select key={item.label} className="field" name={`label:${item.externalId}`} disabled={disabled} aria-label={`Label for row ${item.externalId || item.row}`}
            defaultValue={saved?.overrides?.[item.externalId] ?? (item.label === "choose" ? "" : item.label)}>
            {item.label === "choose" && <option value="">Please choose</option>}
            <option value="invoice">Invoice (money in)</option><option value="expense">Expense or bill (money out)</option>
          </select>}<br /><small className="muted">{item.reason}</small></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

/**
 * Builds an `auto` mapping from the selector; label changes are kept only where they differ from the reader.
 * Saved choices for rows not shown (the preview has at most 100 rows) are kept, never silently undone.
 */
export function readSelectorForm(data: FormData, labels: SelectorLabel[], saved?: Pick<Partial<AutoMapping>, "excludedIds" | "overrides">): AutoMapping {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const optional = (key: string) => text(key) ? { [key]: text(key) } : {};
  const ticked = new Set(data.getAll("row").map(String));
  const shown = new Set(labels.map(item => item.externalId));
  const overrides: Record<string, "invoice" | "expense"> = Object.fromEntries(Object.entries(saved?.overrides ?? {}).filter(([id]) => !shown.has(id)));
  for (const item of labels) {
    const value = text(`label:${item.externalId}`);
    if ((value === "invoice" || value === "expense") && value !== item.label) overrides[item.externalId] = value;
  }
  return {
    kind: "auto", externalId: text("externalId"), amount: text("amount"), dueDate: text("dueDate"), number: text("number"), customerId: text("customerId"),
    label: text("label"), payee: text("payee"), ...optional("customer"), ...optional("typeColumn"), ...optional("paidAmount"), ...optional("openBalance"), ...optional("status"),
    columns: data.getAll("column").map(String), overrides,
    // Payment rows have no checkbox: they are held as payments, never counted as rows the owner left out.
    excludedIds: [...labels.filter(item => item.label !== "payment" && item.externalId && !ticked.has(item.externalId)).map(item => item.externalId),
      ...(saved?.excludedIds ?? []).filter(id => !shown.has(id))].filter((id, index, ids) => ids.indexOf(id) === index),
  } as AutoMapping;
}

/** Problems the owner must fix before saving: a stable ID column and a label for every ticked "Please choose" row. */
export function selectorProblems(data: FormData, labels: SelectorLabel[]): string[] {
  const problems: string[] = [];
  if (!String(data.get("externalId") ?? "").trim()) problems.push(ID_MESSAGE);
  const ticked = new Set(data.getAll("row").map(String));
  const open = labels.filter(item => item.label === "choose" && ticked.has(item.externalId) && !["invoice", "expense"].includes(String(data.get(`label:${item.externalId}`) ?? ""))).length;
  if (open) problems.push(open === 1 ? "Pick Invoice or Expense for 1 row, or untick it." : `Pick Invoice or Expense for ${open} rows, or untick them.`);
  return problems;
}
