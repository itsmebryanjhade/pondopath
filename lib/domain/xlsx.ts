import { Parser } from "saxen";
import { readSheet } from "read-excel-file/node";
import { Unzip, UnzipInflate, zipSync } from "fflate";
import { crc32 } from "node:zlib";
import { CSV_LIMITS, validateImportRows, type CsvFile } from "./imports";
function invalid(): never { throw new Error("Choose a valid, unencrypted XLSX workbook without macros or external links."); }
const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const safePath = (name: string) => !/[\\:\x00-\x1f]/.test(name) && !name.startsWith("/") && name.replace(/\/$/, "").split("/").every(part => part && part !== "." && part !== "..");
type Entry = { name: string; size: number; crc: number; method: number; offset: number; end: number };

function boundedMembers(bytes: Uint8Array): Record<string, Uint8Array> {
  if (!bytes.length || bytes.length > CSV_LIMITS.bytes) throw new Error("Choose an XLSX file up to 512 KiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) invalid();
  const count = u16(end + 10), start = u32(end + 16);
  if (!count || count > 128 || start + u32(end + 12) !== end) invalid();
  const entries = new Map<string, Entry>();
  let position = start;
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || u32(position) !== 0x02014b50) invalid();
    const flags = u16(position + 8), method = u16(position + 10), length = u16(position + 28);
    const next = position + 46 + length + u16(position + 30) + u16(position + 32);
    if (next > end || flags & ~0x808 || ![0, 8].includes(method) || u16(position + 34)) invalid();
    const name = decode(bytes.subarray(position + 46, position + 46 + length));
    if (!safePath(name) || entries.has(name) || /(?:vba|macro|externallinks|embeddings)/i.test(name)) invalid();
    if (!(flags & 0x800) && /[^\x00-\x7f]/.test(name)) invalid();
    const offset = u32(position + 42), compressed = u32(position + 20), size = u32(position + 24), crc = u32(position + 16);
    if (offset + 30 > start || u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method) invalid();
    const localLength = u16(offset + 26), dataStart = offset + 30 + localLength + u16(offset + 28);
    if (dataStart + compressed > start || decode(bytes.subarray(offset + 30, offset + 30 + localLength)) !== name) invalid();
    let dataEnd = dataStart + compressed;
    if (flags & 8) {
      if (dataEnd + 12 > start) invalid();
      if (u32(dataEnd) === 0x08074b50) dataEnd += 4;
      if (dataEnd + 12 > start || u32(dataEnd) !== crc || u32(dataEnd + 4) !== compressed || u32(dataEnd + 8) !== size) invalid();
      dataEnd += 12;
    } else if (u32(offset + 14) !== crc || u32(offset + 18) !== compressed || u32(offset + 22) !== size) invalid();
    entries.set(name, { name, size, crc, method, offset, end: dataEnd });
    position = next;
  }
  if (position !== end) invalid();
  let localEnd = 0;
  for (const entry of [...entries.values()].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== localEnd) invalid();
    localEnd = entry.end;
  }
  if (localEnd !== start) invalid();

  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0, completed = 0, discovered = 0;
  const unzip = new Unzip(file => {
    const entry = entries.get(file.name);
    if (!entry || file.compression !== entry.method || ++discovered > count) invalid();
    const chunks: Uint8Array[] = [];
    let expanded = 0, checksum = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      expanded += chunk.length;
      total += chunk.length;
      if (expanded > 2 * 1024 * 1024 || total > 5 * 1024 * 1024) throw new Error("The workbook exceeds the expanded XLSX size limit.");
      checksum = crc32(chunk, checksum);
      chunks.push(chunk);
      if (final) {
        if (expanded !== entry.size || checksum !== entry.crc || files[file.name]) invalid();
        const value = new Uint8Array(expanded);
        let cursor = 0;
        for (const chunk of chunks) { value.set(chunk, cursor); cursor += chunk.length; }
        files[file.name] = value;
        completed++;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Small input chunks bound the inflater's work before each actual expanded-size check.
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  if (completed !== count || discovered !== count) invalid();
  return files;
}


const localName = (name: string) => name.slice(name.lastIndexOf(":") + 1);
type CellInfo = { type: string; raw: string; outside: boolean; value: boolean };
const SUPPORTED_CELL_TYPES = ["n", "s", "inlineStr", "d"];

function checkedEntities(value: string, decodeEntities: (text: string) => string): string {
  if (/&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)/.test(value)) invalid();
  for (const match of value.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
    const code = match[1][0] === "x" ? parseInt(match[1].slice(1), 16) : Number(match[1]);
    // The downstream XML reader decodes entities with fromCharCode, limited to the BMP.
    if (!(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xfffd && !(code >= 0xd800 && code <= 0xdfff))) invalid();
  }
  return decodeEntities(value);
}

function inspectXml(files: Record<string, Uint8Array>) {
  const sheets: { name: string; relation: string }[] = [];
  const relations = new Map<string, string>();
  const cellInfo = new Map<string, Map<string, CellInfo>>();
  let totalCells = 0;
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.(?:xml|rels)$/i.test(path)) continue;
    const xml = decode(bytes);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(xml)) invalid();
    const parser = new Parser(), stack: string[] = [], cells = new Map<string, CellInfo>();
    let worksheet = false, row = 0, previousRow = 0, previousColumn = 0, rows = 0, roots = 0, cell: CellInfo | undefined;
    parser.on("error", invalid).on("warn", invalid).on("attention", invalid);
    parser.on("openTag", (fullName, getAttributes, decodeEntities) => {
      const name = localName(fullName), parent = stack.at(-1);
      if (stack.length > 64) invalid();
      const attributes: Record<string, string> = Object.create(null);
      for (const [key, value] of Object.entries(getAttributes())) {
        const decoded = checkedEntities(value, decodeEntities);
        if (key === "xmlns" || key.startsWith("xmlns:")) continue;
        const normalized = localName(key);
        if (Object.hasOwn(attributes, normalized)) invalid();
        attributes[normalized] = decoded;
      }
      // Bound custom formats before the reader runs its date-format regular expressions.
      if (name === "numFmt" && (attributes.formatCode?.length ?? 0) > 256) throw new Error("Custom Excel number formats must fit within the 256-character limit.");
      if (!stack.length) { if (++roots > 1) invalid(); worksheet = name === "worksheet"; }
      // Cell formulas are rejected whether or not a cached result is present. Formulas outside
      // cells (conditional formatting, chart series) never become imported values.
      if (worksheet && (name === "f" && parent === "c" || name === "c" && attributes.t === "str")) throw new Error("Replace spreadsheet formulas with literal values before importing.");
      if ([attributes.ContentType, attributes.Type].some(value => /(?:macro|vba|externalLink)/i.test(value || ""))) invalid();
      // Cell hyperlinks (including Excel's automatic mailto links) are never followed; other external targets are refused.
      if (name === "Relationship" && attributes.TargetMode?.toLowerCase() === "external" && !/\/hyperlink$/.test(attributes.Type || "")) invalid();
      // The reader recognizes only date1904="1"; any other truthy spelling would shift every date serial by 1,462 days.
      if (path === "xl/workbook.xml" && name === "workbookPr" && ![undefined, "0", "1", "false"].includes(attributes.date1904))
        throw new Error("This workbook uses an unrecognized date system setting. Save it again from Excel before importing.");
      if (path === "xl/workbook.xml" && name === "sheet") {
        if (!attributes.name || !attributes.id || sheets.some(sheet => sheet.name === attributes.name || sheet.relation === attributes.id) || sheets.length >= 10) invalid();
        sheets.push({ name: attributes.name, relation: attributes.id });
      }
      if (path === "xl/_rels/workbook.xml.rels" && name === "Relationship") {
        if (!attributes.Id || relations.has(attributes.Id) || !attributes.Target) invalid();
        const target = attributes.Target.startsWith("/") ? attributes.Target.slice(1) : "xl/" + attributes.Target;
        if (!safePath(target)) invalid();
        relations.set(attributes.Id, target);
      }
      // Any Excel coordinate is syntactically accepted; cell rows and cell values have tighter limits below.
      const coordinate = (value: string) => {
        const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(value);
        const column = match ? [...match[1]].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) : 0;
        if (!match || column > 16384 || Number(match[2]) > 1048576) invalid();
        return [Number(match![2]), column];
      };
      if (worksheet && name === "row") {
        if (parent !== "sheetData" || ++rows > 1000 || attributes.r && (!/^[1-9]\d{0,3}$/.test(attributes.r) || Number(attributes.r) > 1000)) invalid();
        row = attributes.r ? Number(attributes.r) : 0;
        previousColumn = 0;
      }
      if (worksheet && name === "c") {
        if (parent !== "row" || ++totalCells > 24000) invalid();
        const [cellRow, column] = coordinate(attributes.r || "");
        row ||= cellRow;
        if (cellRow > 1000 || cellRow !== row || column <= previousColumn || row <= previousRow) invalid();
        previousColumn = column;
        cell = { type: attributes.t || "n", raw: "", outside: column > CSV_LIMITS.columns, value: false };
        // Error cells are otherwise read as blanks and TRUE/FALSE cells as text; neither is a reviewed import value.
        if (!SUPPORTED_CELL_TYPES.includes(cell.type)) throw new Error("Replace Excel error values (such as #N/A or #REF!) and TRUE/FALSE cells with plain values before importing.");
        cells.set(attributes.r, cell);
      }
      if (worksheet && cell && (name === "v" || name === "is")) cell.value = true;
      if (worksheet && attributes.ref) for (const ref of attributes.ref.split(":")) coordinate(ref);
      // Column ranges only describe formatting; Excel writes max="16384" for whole formatted columns.
      if (worksheet && name === "col" && (![attributes.min, attributes.max].every(value => /^[1-9]\d{0,4}$/.test(value || "") && Number(value) <= 16384) || Number(attributes.min) > Number(attributes.max))) invalid();
      stack.push(name);
    });
    parser.on("text", (value, decodeEntities) => {
      const text = checkedEntities(value, decodeEntities);
      if (cell && stack.at(-1) === "v") cell.raw += text;
    });
    parser.on("closeTag", fullName => {
      const name = localName(fullName);
      if (stack.pop() !== name) invalid();
      if (worksheet && name === "c") {
        // Styled blank cells beyond column X are harmless; values there exceed the import column limit.
        if (cell?.outside && cell.value) throw new Error("Keep spreadsheet data within columns A–X (24 columns).");
        cell = undefined;
      }
      if (worksheet && name === "row") {
        row ||= previousRow + 1;
        if (row <= previousRow || row > 1000) invalid();
        previousRow = row;
      }
    });
    const error = parser.parse(xml);
    if (error || stack.length || roots !== 1) invalid();
    if (worksheet) cellInfo.set(path, cells);
  }
  if (!sheets.length || !files["xl/workbook.xml"] || !files["xl/_rels/workbook.xml.rels"] || sheets.some(sheet => !cellInfo.has(relations.get(sheet.relation) || ""))) invalid();
  return { sheets, relations, cellInfo };
}

export async function readXlsx(bytes: Uint8Array, sheet?: string): Promise<{ sheets: string[]; sheet: string | null; file: CsvFile | null }> {
  const files = boundedMembers(bytes), inspected = inspectXml(files);
  const sheets = inspected.sheets.map(sheet => sheet.name);
  if (sheet === undefined) return { sheets, sheet: null, file: null };
  const selected = inspected.sheets.find(item => item.name === sheet);
  if (!selected) throw new Error("Select an existing worksheet in this workbook.");
  // The reader only receives a canonical archive of members already bounded and verified.
  const data = await readSheet<{ raw: string }>(Buffer.from(zipSync(files, { level: 0 })), sheet, { trim: false, parseNumber: raw => ({ raw }) });
  const cells = inspected.cellInfo.get(inspected.relations.get(selected.relation)!)!;
  const nonempty = data.map((values, index) => ({ values, row: index + 1 })).filter(({ values }) => values.some(value => value !== null && value !== ""));
  if (nonempty[0]?.row !== 1) throw new Error("Put the column headers in worksheet row 1.");
  const records = nonempty.map(({ values, row }) => values.map((value, index) => {
    if (value === null) return "";
    if (value instanceof Date) {
      const info = cells.get(`${String.fromCharCode(65 + index)}${row}`)!;
      const iso = Number.isFinite(value.getTime()) ? value.toISOString() : "";
      const raw = info.raw.trim();
      const dateOnly = info.type === "d"
        ? /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.0+)?Z)?$/.test(raw) && raw.slice(0, 10) === iso.slice(0, 10)
        : /^\+?\d+(?:\.0+)?$/.test(raw);
      if (!dateOnly || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(iso)) throw new Error("Use valid date-only cells without hidden times.");
      return iso.slice(0, 10);
    }
    return typeof value === "object" ? value.raw : String(value);
  }));
  const file = validateImportRows(records);
  file.rowNumbers = nonempty.slice(1).map(item => item.row);
  file.nonTextCells = nonempty.slice(1).map(({ values }) => values.map(value => value !== null && typeof value !== "string"));
  return { sheets, sheet, file };
}


