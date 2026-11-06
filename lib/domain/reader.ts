import { assertLocalDate } from "./dates";
import { parseMoney } from "./money";

/** Programmed reader: suggests what each imported column means. It never decides money values; the owner confirms every suggestion. */
export type ColumnRole = "externalId" | "date" | "dueDate" | "customer" | "supplier" | "amount" | "type" | "description" | "number" | "ignore";
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

const isMoney = (value: string) => { try { parseMoney(value.replace(/^-/, ""), { allowZero: true }); return true; } catch { return false; } };
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
