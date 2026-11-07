import type { AutoFields, RowLabel } from "./reader";

/** Plain-words helpers for the Add records page. No file is parsed here; the server reads and validates every file. */
export type LabelCounts = { invoice: number; expense: number; payment: number; choose: number };

export function fileKind(name: string): "csv" | "xlsx" | null {
  const match = /\.(csv|xlsx)$/i.exec(name);
  return match ? (match[1].toLowerCase() as "csv" | "xlsx") : null;
}

export const dragHasFiles = (types: readonly string[]) => types.includes("Files");

export function firstFile(files: ArrayLike<File> | null | undefined): File | null {
  return files && files.length ? files[0] : null;
}

export function countLabels(labels: { label: RowLabel }[]): LabelCounts {
  const counts: LabelCounts = { invoice: 0, expense: 0, payment: 0, choose: 0 };
  for (const { label } of labels) counts[label] += 1;
  return counts;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function summaryLine(counts: LabelCounts): string {
  const parts = [counts.invoice ? plural(counts.invoice, "invoice") : "", counts.expense ? plural(counts.expense, "expense") : ""].filter(Boolean);
  if (parts.length) return `We found ${parts.join(" and ")}.${counts.choose ? ` ${counts.choose} more ${counts.choose === 1 ? "row needs" : "rows need"} your choice.` : ""}`;
  if (counts.choose) return counts.choose === 1 ? "We found 1 row. Tell us below if it's an invoice or an expense." : `We found ${counts.choose} rows. Tell us below which are invoices and which are expenses.`;
  if (counts.payment) return "We only found payments in this file. Record them in Collections.";
  return "We couldn't find any invoices or expenses in this file.";
}

export function heldLine(counts: LabelCounts): string {
  const lines: string[] = [];
  if (counts.payment) lines.push(`${plural(counts.payment, "payment")} ${counts.payment === 1 ? "isn't" : "aren't"} imported. Record payments in Collections.`);
  return lines.join(" ");
}

export type PreviewGroup = { title: string; columns: number[] };

/** Columns for the short preview: Name, Who, Amount and Due, each from whichever columns the reader found. */
export function previewColumns(headers: string[], fields: AutoFields): PreviewGroup[] {
  const find = (...names: (string | undefined)[]) => names.map((name) => (name ? headers.indexOf(name) : -1)).filter((index, position, all) => index >= 0 && all.indexOf(index) === position);
  const groups: PreviewGroup[] = [
    { title: "Name", columns: find(fields.number, fields.label, ...(fields.number || fields.label ? [] : [fields.externalId])) },
    { title: "Who", columns: find(fields.customer, fields.payee) },
    { title: "Amount", columns: find(fields.amount) },
    { title: "Due", columns: find(fields.dueDate) },
  ].filter((group) => group.columns.length);
  return groups.length > 1 ? groups : headers.slice(0, 4).map((title, index) => ({ title, columns: [index] }));
}

export function previewCell(cells: (string | number | boolean | null)[], columns: number[]): string {
  for (const column of columns) { const value = String(cells[column] ?? "").trim(); if (value) return value; }
  return "";
}

/** Server messages from `lib/domain/imports.ts` and `lib/domain/xlsx.ts`, turned into what to do next. */
const PLAIN_ERRORS: [RegExp, string][] = [
  [/1–100 data rows/, "Your file needs a row of column names and 1 to 100 rows of records. Check it isn't empty, and send up to 100 rows at a time."],
  [/unique, nonempty column headers/, "Give every column a short, different name in the first row, and keep to 24 columns."],
  [/invalid quoting/, "We couldn't read this CSV. Save it again from Excel as CSV, then try again."],
  [/Each data row must fit/, "One row is too long. Shorten long notes in your file, then try again."],
  [/spreadsheet formulas/, "Your sheet has formulas. Copy the cells and paste them as values, then try again."],
  [/error values/, "Some cells show errors like #N/A, or TRUE/FALSE. Replace them with plain values, then try again."],
  [/column headers in worksheet row 1/, "Put the column names in the first row of the sheet, then try again."],
  [/\.csv or \.xlsx file/, "That file is empty, too big, or not Excel or CSV. Choose an Excel or CSV file with fewer rows."],
  [/Select a worksheet/, "Choose which sheet to use."],
];

export function plainImportError(message: string): string {
  return PLAIN_ERRORS.find(([pattern]) => pattern.test(message))?.[1] ?? "We couldn't read that file. Check it opens in Excel, then try again.";
}

/** An Excel file read without a sheet comes back empty; read its first sheet next. */
export function sheetToRead(kind: "csv" | "xlsx" | null, sheet: string | null, sheets: string[]): string | null {
  return kind === "xlsx" && !sheet && sheets.length ? sheets[0] : null;
}

/** New rows, rows already sent before, and rows that could not be added (bad values in the file, or refused by the server). */
export function summarizeOutcome(previewStatuses: string[], results: { status: string; replayed?: boolean }[]) {
  const skippedInPreview = previewStatuses.filter((status) => status === "invalid" || status === "duplicate").length;
  const open = results.filter((result) => ["pending", "needs_match"].includes(result.status));
  return {
    fresh: open.filter((result) => !result.replayed).length,
    already: results.filter((result) => result.replayed || result.status === "unchanged").length,
    skipped: skippedInPreview + results.filter((result) => result.status === "error").length,
  };
}
