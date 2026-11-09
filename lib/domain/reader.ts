import { assertLocalDate } from "./dates";
import { parseImportedMoney } from "./money";
import type { CsvFile, CsvMapping } from "./imports";

/** Programmed reader: suggests what each imported column means. It never decides money values; the owner confirms every suggestion. */
export type ColumnRole = "externalId" | "date" | "dueDate" | "customer" | "supplier" | "amount" | "paidAmount" | "openBalance" | "status" | "type" | "description" | "number" | "ignore";
export type ColumnSuggestion = { header: string; role: ColumnRole; confidence: "high" | "low" };

/** Header words per role (English, Taglish, Filipino), compared after lower-casing and removing accents and punctuation. */
export const ROLE_WORDS: Record<Exclude<ColumnRole, "ignore">, string[]> = {
  externalId: ["id", "ref", "reference", "ref no", "reference no", "row id", "record id", "source id", "src id", "external id", "code", "sanggunian"],
  number: ["invoice", "invoice no", "invoice number", "inv no", "bill no", "doc no", "document no", "number", "numero", "or no"],
  date: ["date", "petsa", "transaction date", "txn date", "araw", "date issued"],
  dueDate: ["due", "due date", "due on", "payment due", "deadline", "takdang petsa", "maturity", "dapat bayaran"],
  customer: ["customer", "customer name", "client", "kliyente", "buyer", "mamimili", "bill to", "sold to", "suki"],
  supplier: ["supplier", "supplier name", "vendor", "payee", "paid to", "binayaran", "tindahan"],
  amount: ["amount", "halaga", "total", "amount php", "price", "presyo", "gross", "kabuuan"],
  paidAmount: ["paid", "paid amount", "amount paid", "payment amount", "settled amount", "paid to date"],
  openBalance: ["open balance", "outstanding", "outstanding balance", "balance due", "amount due", "remaining balance", "unpaid balance"],
  status: ["status", "payment status", "invoice status", "settlement status", "state"],
  type: ["type", "uri", "kind", "category", "kategorya", "record type", "transaction type", "klase"],
  description: ["description", "paliwanag", "details", "particulars", "item", "memo", "label", "purpose", "detalye"],
};

export const normalizeWords = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function headerMatch(header: string): { role: Exclude<ColumnRole, "ignore">; length: number } | undefined {
  const words = normalizeWords(header).split(" ").filter(Boolean);
  let best: { role: Exclude<ColumnRole, "ignore">; length: number } | undefined;
  for (const [role, phrases] of Object.entries(ROLE_WORDS) as [Exclude<ColumnRole, "ignore">, string[]][])
    for (const phrase of phrases) {
      const parts = phrase.split(" ");
      const found = words.some((_, start) => parts.every((part, offset) => words[start + offset] === part));
      if (found && (!best || parts.length > best.length)) best = { role, length: parts.length };
    }
  return best;
}

const isMoney = (value: string) => { try { parseImportedMoney(value.replace(/^-/, ""), { allowZero: true }); return true; } catch { return false; } };
const isDate = (value: string) => { try { assertLocalDate(value); return true; } catch { return false; } };
const isIdLike = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_\-/.#]{1,63}$/.test(value) && /\d/.test(value);

function shapeMatch(values: string[]): Exclude<ColumnRole, "ignore"> | undefined {
  if (!values.length) return undefined;
  if (values.every(isDate)) return "date";
  if (values.every(isMoney)) return "amount";
  if (values.every(isIdLike) && /[A-Za-z]/.test(values.join("")) && new Set(values).size === values.length) return "externalId";
  return undefined;
}

export function suggestColumns(headers: string[], samples: string[][]): ColumnSuggestion[] {
  const candidates = headers.map((header, index) => {
    const values = samples.map(row => String(row[index] ?? "").trim()).filter(Boolean);
    const match = headerMatch(header);
    if (match) {
      // An ID column must be unique to identify rows; repeated values lower confidence.
      const unique = new Set(values).size === values.length;
      const confidence: "high" | "low" = match.role === "externalId" && !unique ? "low" : "high";
      return { index, role: match.role, confidence, score: match.length };
    }
    const shape = shapeMatch(values);
    return shape ? { index, role: shape, confidence: "low" as const, score: 0 } : undefined;
  });
  const result: ColumnSuggestion[] = headers.map(header => ({ header, role: "ignore", confidence: "low" }));
  const used = new Set<ColumnRole>();
  const ordered = candidates.filter(candidate => candidate !== undefined)
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1) || b.score - a.score || a.index - b.index);
  for (const candidate of ordered) {
    if (used.has(candidate.role)) continue;
    used.add(candidate.role);
    result[candidate.index] = { header: headers[candidate.index], role: candidate.role, confidence: candidate.confidence };
  }
  return result;
}

export function maskImportSamples(file: { headers: string[]; rows: (string | number | boolean | null)[][] }): { headers: { id: string; name: string }[]; samples: string[][] } {
  const mask = (value: string) => {
    const text = value.trim();
    if (!text) return "";
    if (isDate(text)) return "<date>";
    if (isMoney(text)) return "<amount>";
    if (isIdLike(text)) return "<id>";
    if (/^(invoice|bill|payment|paid|unpaid|settled|open|partially paid|partly paid)$/i.test(text)) return "<choice>";
    return "<text>";
  };
  return {
    headers: file.headers.slice(0, 24).map((name, index) => ({ id: `c${index}`, name: name.slice(0, 80) })),
    samples: file.rows.slice(0, 3).map(row => file.headers.slice(0, 24).map((_, index) => mask(String(row[index] ?? "")))),
  };
}

export type RowLabel = "invoice" | "expense" | "payment" | "choose";
export type AutoMapping = Extract<CsvMapping, { kind: "auto" }>;
export type MixedMapping = Extract<CsvMapping, { kind: "mixed" }>;
export const READER_TYPE_COLUMN = "__pondopath_type";

const TYPE_WORDS: Record<Exclude<RowLabel, "choose">, string[]> = {
  invoice: ["invoice", "sales", "sale", "sold", "benta", "receivable", "singil", "income"],
  expense: ["bill", "bills", "expense", "expenses", "gastos", "gastusin", "purchase", "bayarin", "payable", "cost"],
  payment: ["payment", "paid", "bayad", "nabayaran", "resibo", "receipt", "collection", "received", "remittance"],
};
const wordsOf = (text: string) => new Set(normalizeWords(text).split(" ").filter(Boolean));
const typeOf = (text: string) => (Object.entries(TYPE_WORDS) as [Exclude<RowLabel, "choose">, string[]][])
  .find(([, words]) => words.some(word => wordsOf(text).has(word)))?.[0];

/** Labels every row with programmed rules in order: Type words, party column, negative amount, payment words. Conflicts ask the owner. */
export type LabelFields = Pick<AutoMapping, "externalId" | "amount" | "overrides"> & Partial<Pick<AutoMapping, "customer" | "payee" | "typeColumn" | "label">>;
export function labelRows(file: CsvFile, mapping: LabelFields): { row: number; externalId: string; label: RowLabel; reason: string }[] {
  const cell = (values: string[], header?: string) => header && file.headers.includes(header) ? String(values[file.headers.indexOf(header)] ?? "").trim() : "";
  const partyColumns = mapping.customer && mapping.customer !== mapping.payee;
  return file.rows.map((values, index) => {
    const externalId = cell(values, mapping.externalId);
    const base = { row: file.rowNumbers?.[index] ?? index + 2, externalId };
    const override = mapping.overrides[externalId];
    if (override) return { ...base, label: override, reason: "Changed by you" };
    const typeText = cell(values, mapping.typeColumn);
    const fromType = typeText ? typeOf(typeText) : undefined;
    if (fromType === "payment") return { ...base, label: "payment", reason: `Type says “${typeText}”` };
    const signals: { label: "invoice" | "expense"; reason: string }[] = [];
    if (fromType) signals.push({ label: fromType, reason: `Type says “${typeText}”` });
    if (partyColumns) {
      const customer = cell(values, mapping.customer), supplier = cell(values, mapping.payee);
      if (customer && !supplier) signals.push({ label: "invoice", reason: `${mapping.customer} filled in` });
      if (supplier && !customer) signals.push({ label: "expense", reason: `${mapping.payee} filled in` });
    }
    if (cell(values, mapping.amount).startsWith("-")) signals.push({ label: "expense", reason: "Negative amount" });
    const labels = new Set(signals.map(signal => signal.label));
    if (labels.size === 1) return { ...base, label: signals[0].label, reason: signals.map(signal => signal.reason).join("; ") };
    if (labels.size > 1) return { ...base, label: "choose", reason: signals.map(signal => signal.reason).join(" but ") };
    if (typeOf(cell(values, mapping.label)) === "payment") return { ...base, label: "payment", reason: "Description mentions a payment" };
    return { ...base, label: "choose", reason: typeText ? `Type “${typeText}” is not recognised` : "Nothing shows whether this is money in or out" };
  });
}

/** Applies the owner's setup and the labels, producing a file and mixed mapping that the existing mapCsv path understands. */
export function applyReader(file: CsvFile, mapping: AutoMapping): { file: CsvFile; mixed: MixedMapping; payments: number[]; choose: number[]; excluded: number } {
  const labels = labelRows(file, mapping);
  const counts = new Map<string, number>();
  for (const { externalId } of labels) if (externalId) counts.set(externalId, (counts.get(externalId) ?? 0) + 1);
  const keep = mapping.columns.map(header => file.headers.indexOf(header));
  const amountAt = mapping.columns.indexOf(mapping.amount);
  const result: CsvFile = { headers: [...mapping.columns, READER_TYPE_COLUMN], rows: [], rowNumbers: [], ...(file.rowSheets ? { rowSheets: [] } : {}), ...(file.nonTextCells ? { nonTextCells: [] } : {}) };
  const payments: number[] = [], choose: number[] = [];
  let excluded = 0;
  labels.forEach(({ row, externalId, label }, index) => {
    if (mapping.excludedIds.includes(externalId)) { excluded++; return; }
    // Repeated IDs always reach mapCsv so that both rows are reported as duplicates rather than one being silently dropped.
    const duplicate = (counts.get(externalId) ?? 0) > 1;
    if (!duplicate && label === "payment") { payments.push(row); return; }
    if (!duplicate && label === "choose") { choose.push(row); return; }
    const values = keep.map(at => at < 0 ? "" : file.rows[index][at] ?? "");
    // An expense written as a negative amount is money out; the record stores the positive amount.
    if (label === "expense" && amountAt >= 0) values[amountAt] = values[amountAt].trim().replace(/^-/, "");
    result.rows.push([...values, label]);
    result.rowNumbers!.push(row);
    if (file.rowSheets) result.rowSheets!.push(file.rowSheets[index]);
    result.nonTextCells?.push([...keep.map(at => at >= 0 && !!file.nonTextCells?.[index]?.[at]), false]);
  });
  const mixed: MixedMapping = {
    kind: "mixed", externalId: mapping.externalId, amount: mapping.amount, dueDate: mapping.dueDate, typeColumn: READER_TYPE_COLUMN,
    invoiceValues: ["invoice"], expenseValues: ["expense"], number: mapping.number, customerId: mapping.customerId, label: mapping.label, payee: mapping.payee,
    ...(mapping.customer ? { customer: mapping.customer } : {}), ...(mapping.recordId ? { recordId: mapping.recordId } : {}),
    ...(mapping.currency ? { currency: mapping.currency } : {}), ...(mapping.filter ? { filter: mapping.filter } : {}),
    ...(mapping.paidAmount ? { paidAmount: mapping.paidAmount } : {}), ...(mapping.openBalance ? { openBalance: mapping.openBalance } : {}),
    ...(mapping.status ? { status: mapping.status } : {}),
  };
  return { file: result, mixed, payments, choose, excluded };
}

export type AutoFields = Partial<Record<"externalId" | "number" | "amount" | "paidAmount" | "openBalance" | "status" | "dueDate" | "customer" | "payee" | "label" | "typeColumn", string>>;
/** Turns column suggestions into mapping fields, with fallbacks the owner can change: due date ← date, invoice number ← row ID, payee/label ← nearest text column. */
export function suggestAutoFields(suggestions: ColumnSuggestion[]): AutoFields {
  const of = (role: ColumnRole) => suggestions.find(item => item.role === role)?.header;
  const fields: AutoFields = {
    externalId: of("externalId"), number: of("number") ?? of("externalId"), amount: of("amount"), dueDate: of("dueDate") ?? of("date"),
    paidAmount: of("paidAmount"), openBalance: of("openBalance"), status: of("status"),
    customer: of("customer"), payee: of("supplier") ?? of("customer") ?? of("description"),
    label: of("description") ?? of("type") ?? of("supplier") ?? of("customer"), typeColumn: of("type"),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, header]) => header)) as AutoFields;
}
