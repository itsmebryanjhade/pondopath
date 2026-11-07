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
  return parts.length ? `We found ${parts.join(" and ")}.` : "We couldn't find any invoices or expenses in this file.";
}

export function heldLine(counts: LabelCounts): string {
  const lines: string[] = [];
  if (counts.payment) lines.push(`${plural(counts.payment, "payment")} ${counts.payment === 1 ? "isn't" : "aren't"} imported. Record payments in Collections.`);
  if (counts.choose) lines.push(`${plural(counts.choose, "row")} ${counts.choose === 1 ? "needs" : "need"} your choice below.`);
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

export function plainImportError(message: string): string {
  if (/data rows|too many rows/i.test(message)) return "That file has too many rows. Send up to 100 at a time.";
  if (/column/i.test(message)) return "That file has too many columns. Keep up to 24.";
  if (/KiB|\.csv or \.xlsx|too large|too big/i.test(message)) return "That file is too big, or isn't Excel or CSV. Export fewer rows and try again.";
  return "We couldn't read that file. Check it opens in Excel, then try again.";
}
