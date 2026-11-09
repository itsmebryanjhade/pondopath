import { parse } from "csv-parse/sync";
import { z } from "zod";
import { checkedSum, parseMoney } from "./money";
import { assertLocalDate } from "./dates";
import { parseIntakeCandidate, type IntakeCandidate } from "./intake";

export const CSV_LIMITS = { bytes: 512 * 1024, rows: 100, columns: 24, recordBytes: 16 * 1024 } as const;
export type CsvFile = { headers: string[]; rows: string[][]; rowNumbers?: number[]; rowSheets?: string[]; nonTextCells?: boolean[][] };
const column = z.string().trim().min(1).max(200);
const rowFilter = z.strictObject({ column, value: z.string().trim().min(1).max(200) }).optional();
const typeValues = z.array(z.string().trim().min(1).max(100)).min(1).max(10);
/** Case-insensitive, trimmed comparison shared by the Type column and the row filter. */
const sameValue = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const csvMappingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invoice"), externalId: column, number: column, amount: column, dueDate: column, customerId: z.uuid(), customer: column.optional(), recordId: column.optional(), currency: column.optional(), paidAmount: column.optional(), openBalance: column.optional(), status: column.optional(), filter: rowFilter }),
  z.strictObject({ kind: z.literal("expense"), externalId: column, label: column, payee: column, amount: column, dueDate: column, recordId: column.optional(), currency: column.optional(), paidAmount: column.optional(), openBalance: column.optional(), status: column.optional(), filter: rowFilter }),
  z.strictObject({
    kind: z.literal("mixed"), externalId: column, amount: column, dueDate: column, typeColumn: column, invoiceValues: typeValues, expenseValues: typeValues,
    number: column, customerId: z.uuid(), customer: column.optional(), label: column, payee: column, recordId: column.optional(), currency: column.optional(), paidAmount: column.optional(), openBalance: column.optional(), status: column.optional(), filter: rowFilter,
  }),
  // The reader labels each row; the owner's ticked columns, left-out rows and label changes are keyed by the row's stable ID.
  z.strictObject({
    kind: z.literal("auto"), externalId: column, amount: column, dueDate: column, number: column, customerId: z.uuid(), customer: column.optional(),
    label: column, payee: column, recordId: column.optional(), currency: column.optional(), typeColumn: column.optional(), paidAmount: column.optional(), openBalance: column.optional(), status: column.optional(), filter: rowFilter,
    columns: z.array(column).min(1).max(24), excludedIds: z.array(z.string().trim().min(1).max(200)).max(500),
    overrides: z.record(z.string().trim().min(1).max(200), z.enum(["invoice", "expense"])).refine(value => Object.keys(value).length <= 500, "Too many label changes."),
  }),
]).superRefine((mapping, context) => {
  if (mapping.kind === "mixed" && mapping.expenseValues.some(value => mapping.invoiceValues.some(other => sameValue(value, other))))
    context.addIssue({ code: "custom", path: ["expenseValues"], message: "A Type value cannot mean both invoice and expense." });
  if (mapping.kind === "auto") {
    const used = [mapping.externalId, mapping.amount, mapping.dueDate, mapping.number, mapping.customer, mapping.label, mapping.payee, mapping.recordId, mapping.currency, mapping.typeColumn, mapping.paidAmount, mapping.openBalance, mapping.status, mapping.filter?.column];
    for (const header of used) if (header && !mapping.columns.includes(header))
      context.addIssue({ code: "custom", path: ["columns"], message: `Tick the column “${header}”; it is used in the mapping.` });
  }
});
export type CsvMapping = z.infer<typeof csvMappingSchema>;
export type IntakeBinding = { externalId: string; type: string; recordId: string };
export type ImportContext = {
  customers: { id: string; name?: string }[];
  invoices: { id: string; number: string; customer_id: string; amount_cents: number; due_date: string; paid_cents?: number; outstanding_cents?: number }[];
  expenses: { id: string; label: string; payee: string; amount_cents: number; due_date: string }[];
  bindings: IntakeBinding[];
};
export type CsvRow = {
  row: number; externalId: string; sheet?: string; status: "new" | "changed" | "unchanged" | "needs_match" | "balance_review" | "settled" | "duplicate" | "invalid" | "filtered";
  message: string; fields: Record<string, string>; openCents?: number; candidate?: IntakeCandidate;
};

export function readCsv(bytes: Uint8Array): CsvFile {
  if (!bytes.length || bytes.length > CSV_LIMITS.bytes) throw new Error("Choose a UTF-8 CSV file up to 512 KiB.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("The CSV must use UTF-8 encoding."); }
  if (text.includes("\0")) throw new Error("The file contains unsupported binary data.");
  let records: string[][];
  try {
    records = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: CSV_LIMITS.recordBytes, to: CSV_LIMITS.rows + 2 });
  } catch { throw new Error("The CSV has invalid quoting or a row larger than 16 KiB."); }
  return validateImportRows(records);
}

export function checkImportHeaders(rawHeaders: string[]): string[] {
  const headers = rawHeaders.map(value => value.trim());
  if (!headers.length || headers.length > CSV_LIMITS.columns || headers.some(value => !value || value.length > 200) || new Set(headers).size !== headers.length)
    throw new Error("Use up to 24 unique, nonempty column headers (maximum 200 characters each).");
  return headers;
}

export function checkImportRowBytes(rows: string[][]) {
  if (rows.some(row => new TextEncoder().encode(row.join("\0")).length > CSV_LIMITS.recordBytes)) throw new Error("Each data row must fit within 16 KiB.");
}

export function validateImportRows(records: string[][], maximumRows: number = CSV_LIMITS.rows): CsvFile {
  const [rawHeaders, ...rows] = records;
  if (!rawHeaders?.length || !rows.length || rows.length > maximumRows) throw new Error(`Include a header and 1–${maximumRows} data rows per import.`);
  const headers = checkImportHeaders(rawHeaders);
  checkImportRowBytes(rows);
  return { headers, rows };
}

export function mapCsv(file: CsvFile, input: CsvMapping, context: ImportContext): CsvRow[] {
  const mapping = csvMappingSchema.parse(input);
  if (mapping.kind === "auto") throw new Error("Use the reader first.");
  const fallbackCustomer = mapping.kind === "expense" ? undefined : mapping.customerId;
  if (fallbackCustomer && !context.customers.some(customer => customer.id === fallbackCustomer)) throw new Error("Select an existing customer in your business.");
  const numberColumn = mapping.kind === "expense" ? undefined : mapping.number;
  const { kind: _kind, customerId: _customerId, invoiceValues: _invoiceValues, expenseValues: _expenseValues, filter, ...columns } =
    { customerId: undefined, invoiceValues: undefined, expenseValues: undefined, filter: undefined, ...mapping };
  void _kind; void _customerId; void _invoiceValues; void _expenseValues;
  const mappedHeaders = [...Object.values(columns), filter?.column].filter((header): header is string => !!header);
  for (const header of mappedHeaders) if (!file.headers.includes(header)) throw new Error(`Column “${header}” is missing.`);
  const rows = file.rows.map((values, index): CsvRow => {
    const fields = Object.fromEntries(mappedHeaders.map(header => [header, values[file.headers.indexOf(header)] ?? ""]));
    const value = (header?: string) => header ? (fields[header] ?? "").trim() : "";
    const externalId = value(mapping.externalId);
    const result: CsvRow = { row: file.rowNumbers?.[index] ?? index + 2, externalId, ...(file.rowSheets?.[index] ? { sheet: file.rowSheets[index] } : {}), status: "invalid", message: "", fields };
    if (filter && !sameValue(value(filter.column), filter.value)) return { ...result, status: "filtered", message: "Skipped by the row filter." };
    try {
      if (values.length !== file.headers.length) throw new Error("This row has a different number of columns than the header.");
      for (const header of [mapping.externalId, mapping.recordId, numberColumn]) {
        if (header && value(header) && file.nonTextCells?.[index]?.[file.headers.indexOf(header)]) throw new Error("Store identifiers as text in the spreadsheet: " + header + ".");
      }
      if (!externalId || externalId.length > 200) throw new Error("A stable source row ID (up to 200 characters) is required.");
      if (mapping.currency && value(mapping.currency) !== "PHP") throw new Error("Only PHP amounts are supported.");
      const dueDate = value(mapping.dueDate);
      try { assertLocalDate(dueDate); } catch { throw new Error("Use an unambiguous due date in YYYY-MM-DD format."); }
      let rowKind: "invoice" | "expense";
      if (mapping.kind !== "mixed") rowKind = mapping.kind;
      else {
        const type = value(mapping.typeColumn);
        if (mapping.invoiceValues.some(item => sameValue(item, type))) rowKind = "invoice";
        else if (mapping.expenseValues.some(item => sameValue(item, type))) rowKind = "expense";
        else throw new Error(`Unknown type '${type}'.`);
      }
      const binding = context.bindings.find(item => item.externalId === externalId);
      if (binding && binding.type !== `save_${rowKind}`) throw new Error("This source ID already belongs to a different record kind.");
      const explicitId = value(mapping.recordId);
      if (explicitId && binding && binding.recordId !== explicitId) throw new Error("The record ID conflicts with the previously applied source row.");
      const id = explicitId || binding?.recordId;
      const amountCents = parseMoney(value(mapping.amount));
      const paidCents = mapping.paidAmount && value(mapping.paidAmount) ? parseMoney(value(mapping.paidAmount), { allowZero: true }) : undefined;
      const declaredOpenCents = mapping.openBalance && value(mapping.openBalance) ? parseMoney(value(mapping.openBalance), { allowZero: true }) : undefined;
      if (paidCents !== undefined && paidCents > amountCents) throw new Error("The paid amount cannot exceed the original amount.");
      if (declaredOpenCents !== undefined && declaredOpenCents > amountCents) throw new Error("The open balance cannot exceed the original amount.");
      const openCents = declaredOpenCents ?? (paidCents === undefined ? undefined : amountCents - paidCents);
      const sourceStatus = value(mapping.status).trim().toLowerCase();
      const settled = /^(paid|settled|closed|complete|completed)$/.test(sourceStatus) || openCents === 0;
      const partlyPaid = /partial|partly/.test(sourceStatus) || paidCents !== undefined && paidCents > 0 || openCents !== undefined && openCents > 0 && openCents < amountCents;
      if (rowKind === "invoice" && settled) return { ...result, status: "settled", openCents: 0, message: "Settled invoice excluded; no payment is recorded from this row." };
      const common = { ...(id ? { id } : {}), amountCents, dueDate };
      let customerId = "customerId" in mapping ? mapping.customerId : "";
      if (rowKind === "invoice" && mapping.kind !== "expense" && value(mapping.customer)) {
        const importedCustomer = value(mapping.customer).toLowerCase();
        const matches = context.customers.filter(customer => customer.id.toLowerCase() === importedCustomer || customer.name?.trim().toLowerCase() === importedCustomer);
        if (matches.length !== 1) throw new Error(matches.length ? "This customer name matches more than one saved customer. Choose a customer." : "This customer name is not in your business. Choose an existing customer.");
        customerId = matches[0].id;
      }
      const candidate = parseIntakeCandidate(rowKind === "invoice" && mapping.kind !== "expense"
        ? { type: "save_invoice", payload: { ...common, number: value(mapping.number), customerId } }
        : mapping.kind !== "invoice"
          ? { type: "save_expense", payload: { ...common, label: value(mapping.label), payee: value(mapping.payee) } }
          : null);
      if (candidate.type === "save_invoice" && !context.customers.some(customer => customer.id === candidate.payload.customerId)) throw new Error("Customer ID is not in your business. Select a customer or correct this row.");
      const current = candidate.type === "save_invoice"
        ? context.invoices.find(item => id ? item.id === id : item.number === candidate.payload.number)
        : context.expenses.find(item => item.id === id);
      if (id && !current) throw new Error("The mapped record ID is unavailable in this business.");
      const unchanged = current && current.amount_cents === candidate.payload.amountCents && current.due_date === candidate.payload.dueDate &&
        (candidate.type === "save_invoice" ? "number" in current && current.number === candidate.payload.number && current.customer_id === candidate.payload.customerId
          : "label" in current && current.label === candidate.payload.label && current.payee === candidate.payload.payee);
      const ambiguous = candidate.type === "save_expense" && !id && context.expenses.some(item => item.label === candidate.payload.label && item.payee === candidate.payload.payee && item.amount_cents === candidate.payload.amountCents && item.due_date === candidate.payload.dueDate);
      if (candidate.type === "save_invoice" && (partlyPaid || (current && "paid_cents" in current && (current.paid_cents ?? 0) > 0 && !unchanged))) {
        const currentOpen = current && "outstanding_cents" in current ? current.outstanding_cents : undefined;
        return { ...result, status: "balance_review", openCents: currentOpen ?? openCents, message: "This invoice has an open balance. Review the original total and paid amount before importing; this row will not record a payment." };
      }
      return { ...result, candidate, status: unchanged ? "unchanged" : current ? "changed" : ambiguous ? "needs_match" : "new", message: unchanged ? "Already matches the saved record." : ambiguous ? "A matching bill exists. Choose the saved record in review." : "Review before applying." };
    } catch (error) { return { ...result, message: error instanceof Error ? error.message : "Check the mapped values." }; }
  });
  const ids = new Map<string, number>();
  const identities = new Map<string, number>();
  for (const row of rows) {
    if (row.externalId && row.status !== "filtered") ids.set(row.externalId, (ids.get(row.externalId) ?? 0) + 1);
    if (row.candidate) {
      const identity = row.candidate.payload.id || (row.candidate.type === "save_invoice" ? row.candidate.payload.number : JSON.stringify(row.candidate.payload));
      identities.set(identity, (identities.get(identity) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    const identity = row.candidate && (row.candidate.payload.id || (row.candidate.type === "save_invoice" ? row.candidate.payload.number : JSON.stringify(row.candidate.payload)));
    if ((ids.get(row.externalId) ?? 0) > 1 || identity && (identities.get(identity) ?? 0) > 1) { row.status = "duplicate"; row.message = "Repeated source ID or record in this file. Resolve both rows before importing."; }
  }
  checkedSum(rows.flatMap(row => row.candidate ? [row.candidate.payload.amountCents] : []));
  return rows;
}
