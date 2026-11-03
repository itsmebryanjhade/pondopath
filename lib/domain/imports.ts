import { parse } from "csv-parse/sync";
import { z } from "zod";
import { checkedSum, parseMoney } from "./money";
import { parseIntakeCandidate, type IntakeCandidate } from "./intake";

export const CSV_LIMITS = { bytes: 512 * 1024, rows: 100, columns: 24, recordBytes: 16 * 1024 } as const;
export type CsvFile = { headers: string[]; rows: string[][] };
const column = z.string().trim().min(1).max(200);
export const csvMappingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invoice"), externalId: column, number: column, amount: column, dueDate: column, customerId: z.uuid(), customer: column.optional(), recordId: column.optional(), currency: column.optional() }),
  z.strictObject({ kind: z.literal("expense"), externalId: column, label: column, payee: column, amount: column, dueDate: column, recordId: column.optional(), currency: column.optional() }),
]);
export type CsvMapping = z.infer<typeof csvMappingSchema>;
export type IntakeBinding = { externalId: string; type: string; recordId: string };
export type ImportContext = {
  customers: { id: string }[];
  invoices: { id: string; number: string; customer_id: string; amount_cents: number; due_date: string }[];
  expenses: { id: string; label: string; payee: string; amount_cents: number; due_date: string }[];
  bindings: IntakeBinding[];
};
export type CsvRow = {
  row: number; externalId: string; status: "new" | "changed" | "unchanged" | "needs_match" | "duplicate" | "invalid";
  message: string; fields: Record<string, string>; candidate?: IntakeCandidate;
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
  const [rawHeaders, ...rows] = records;
  if (!rawHeaders?.length || !rows.length || rows.length > CSV_LIMITS.rows) throw new Error("Include a header and 1–100 data rows per import.");
  const headers = rawHeaders.map(value => value.trim());
  if (headers.length > CSV_LIMITS.columns || headers.some(value => !value || value.length > 200) || new Set(headers).size !== headers.length)
    throw new Error("Use up to 24 unique, nonempty column headers (maximum 200 characters each).");
  return { headers, rows };
}

export function mapCsv(file: CsvFile, input: CsvMapping, context: ImportContext): CsvRow[] {
  const mapping = csvMappingSchema.parse(input);
  if (mapping.kind === "invoice" && !context.customers.some(customer => customer.id === mapping.customerId)) throw new Error("Select an existing customer in your business.");
  const { kind: _kind, customerId: _customerId, ...columns } = { customerId: undefined, ...mapping };
  void _kind; void _customerId;
  for (const header of Object.values(columns)) if (header && !file.headers.includes(header)) throw new Error(`Column “${header}” is missing.`);
  const rows = file.rows.map((values, index): CsvRow => {
    const fields = Object.fromEntries(Object.values(columns).filter((header): header is string => !!header).map(header => [header, values[file.headers.indexOf(header)] ?? ""]));
    const value = (header?: string) => header ? (fields[header] ?? "").trim() : "";
    const externalId = value(mapping.externalId);
    const result: CsvRow = { row: index + 2, externalId, status: "invalid", message: "", fields };
    try {
      if (values.length !== file.headers.length) throw new Error("This row has a different number of columns than the header.");
      if (!externalId || externalId.length > 200) throw new Error("A stable source row ID (up to 200 characters) is required.");
      if (mapping.currency && value(mapping.currency) !== "PHP") throw new Error("Only PHP amounts are supported.");
      const binding = context.bindings.find(item => item.externalId === externalId);
      if (binding && binding.type !== `save_${mapping.kind}`) throw new Error("This source ID already belongs to a different record kind.");
      const explicitId = value(mapping.recordId);
      if (explicitId && binding && binding.recordId !== explicitId) throw new Error("The record ID conflicts with the previously applied source row.");
      const id = explicitId || binding?.recordId;
      const common = { ...(id ? { id } : {}), amountCents: parseMoney(value(mapping.amount)), dueDate: value(mapping.dueDate) };
      const candidate = parseIntakeCandidate(mapping.kind === "invoice"
        ? { type: "save_invoice", payload: { ...common, number: value(mapping.number), customerId: value(mapping.customer) || mapping.customerId } }
        : { type: "save_expense", payload: { ...common, label: value(mapping.label), payee: value(mapping.payee) } });
      if (candidate.type === "save_invoice" && !context.customers.some(customer => customer.id === candidate.payload.customerId)) throw new Error("Customer ID is not in your business. Select a customer or correct this row.");
      const current = candidate.type === "save_invoice"
        ? context.invoices.find(item => id ? item.id === id : item.number === candidate.payload.number)
        : context.expenses.find(item => item.id === id);
      if (id && !current) throw new Error("The mapped record ID is unavailable in this business.");
      const unchanged = current && current.amount_cents === candidate.payload.amountCents && current.due_date === candidate.payload.dueDate &&
        (candidate.type === "save_invoice" ? "number" in current && current.number === candidate.payload.number && current.customer_id === candidate.payload.customerId
          : "label" in current && current.label === candidate.payload.label && current.payee === candidate.payload.payee);
      const ambiguous = candidate.type === "save_expense" && !id && context.expenses.some(item => item.label === candidate.payload.label && item.payee === candidate.payload.payee && item.amount_cents === candidate.payload.amountCents && item.due_date === candidate.payload.dueDate);
      return { ...result, candidate, status: unchanged ? "unchanged" : current ? "changed" : ambiguous ? "needs_match" : "new", message: unchanged ? "Already matches the saved record." : ambiguous ? "A matching bill exists. Choose the saved record in review." : "Review before applying." };
    } catch (error) { return { ...result, message: error instanceof Error ? error.message : "Check the mapped values." }; }
  });
  const ids = new Map<string, number>();
  const identities = new Map<string, number>();
  for (const row of rows) {
    if (row.externalId) ids.set(row.externalId, (ids.get(row.externalId) ?? 0) + 1);
    if (row.candidate) {
      const identity = row.candidate.payload.id || (row.candidate.type === "save_invoice" ? row.candidate.payload.number : JSON.stringify(row.candidate.payload));
      identities.set(identity, (identities.get(identity) ?? 0) + 1);
    }
  }
  for (const row of rows) if (row.candidate) {
    const identity = row.candidate.payload.id || (row.candidate.type === "save_invoice" ? row.candidate.payload.number : JSON.stringify(row.candidate.payload));
    if ((ids.get(row.externalId) ?? 0) > 1 || (identities.get(identity) ?? 0) > 1) { row.status = "duplicate"; row.message = "Repeated source ID or record in this file. Resolve both rows before importing."; }
  }
  checkedSum(rows.flatMap(row => row.candidate ? [row.candidate.payload.amountCents] : []));
  return rows;
}
