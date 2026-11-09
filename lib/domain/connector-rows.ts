import { z } from "zod";
import { checkImportHeaders, checkImportRowBytes, type CsvFile } from "./imports";

export const CONNECTOR_LIMITS = { rows: 500, stagedPerRead: 100 } as const;
const runId = z.string().trim().min(1).max(200);
const cell = z.union([z.string().max(16_384), z.number(), z.boolean(), z.null()]);

/** What the n8n workflow posts: either one Sheet read or a read failure. */
export const connectorReadSchema = z.union([
  z.strictObject({
    runId,
    headers: z.array(z.string().max(200)).min(1).max(24),
    rows: z.array(z.array(cell).max(24)).max(CONNECTOR_LIMITS.rows),
    rowNumbers: z.array(z.number().int().min(2).max(10_000_000)),
  }).refine(read => read.rowNumbers.length === read.rows.length, { message: "Each row needs its Sheet row number." }),
  z.strictObject({ runId, error: z.enum(["SHEET_ACCESS_DENIED", "SHEET_NOT_FOUND", "READ_FAILED"]) }),
]);
export type ConnectorRead = z.infer<typeof connectorReadSchema>;

/**
 * The request shape accepted before authentication. It has no row/column limits (the 512 KiB body cap bounds it),
 * so an over-limit Sheet can still be authenticated and recorded as a failed read the owner can see.
 */
const looseCell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const connectorEnvelopeSchema = z.union([
  z.strictObject({ runId, headers: z.array(z.string()), rows: z.array(z.array(looseCell)), rowNumbers: z.array(z.number().int()) }),
  z.strictObject({ runId, error: z.enum(["SHEET_ACCESS_DENIED", "SHEET_NOT_FOUND", "READ_FAILED"]) }),
]);
export type ConnectorEnvelope = z.infer<typeof connectorEnvelopeSchema>;
export type ConnectorSheetRead = Extract<ConnectorRead, { headers: string[] }>;
export type ConnectorFile = CsvFile & { booleanCells: boolean[][] };

// Google Sheets' 1900 date system: serial 0 is 1899-12-30 (UTC).
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

/** Turns n8n's unformatted Sheet values into text cells for the shared CSV mapping rules. */
export function normalizeConnectorRows(read: ConnectorSheetRead, options: { dateColumns: string[] }): ConnectorFile {
  const headers = checkImportHeaders(read.headers);
  const dateIndexes = new Set(options.dateColumns.map(name => headers.indexOf(name)).filter(index => index >= 0));
  const nonTextCells: boolean[][] = [];
  const booleanCells: boolean[][] = [];
  const rows = read.rows.map(values => {
    const numeric: boolean[] = [];
    const booleans: boolean[] = [];
    const cells = values.map((value, index) => {
      numeric.push(typeof value === "number");
      booleans.push(typeof value === "boolean");
      if (value === null) return "";
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
      if (typeof value === "string") return value;
      // Whole serials become dates; anything else stays as text and fails normal date or money validation.
      if (dateIndexes.has(index) && Number.isInteger(value)) {
        const date = new Date(SERIAL_EPOCH + value * DAY);
        if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
      }
      return String(value);
    });
    nonTextCells.push(numeric);
    booleanCells.push(booleans);
    return cells;
  });
  checkImportRowBytes(rows);
  return { headers, rows, rowNumbers: [...read.rowNumbers], nonTextCells, booleanCells };
}
