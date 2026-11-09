import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { fictionalWorkbook300Fixture, fictionalWorkbookFixture } from "@/tests/fixtures/workbook-onboarding";
import { MAX_WORKBOOK_DATA_ROWS, readXlsx, readXlsxSheets } from "./xlsx";
import { mapCsv, readCsv, type CsvMapping } from "./imports";
import { applyReader, suggestAutoFields, suggestColumns } from "./reader";
import { summarizeWorkbookRows } from "./add-records";

const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const text = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const number = (ref: string, value: string, style = "") => `<c r="${ref}" ${style}><v>${value}</v></c>`;
const header = `<row r="1">${["ID", "Invoice", "Amount", "Due"].map((v, i) => text(`${String.fromCharCode(65 + i)}1`, v)).join("")}</row>`;
const data = (row = 2, id = "0001", amount = "10.25", date = text(`D${row}`, "2026-11-05")) => `<row r="${row}">${text(`A${row}`, id)}${text(`B${row}`, `INV-${id}`)}${number(`C${row}`, amount)}${date}</row>`;
const sheet = (rows = header + data()) => `<worksheet ${ns}><sheetData>${rows}</sheetData></worksheet>`;
function members(sheets: Record<string, string> = { Invoices: sheet() }, extra: Record<string, string | Uint8Array> = {}) {
  const names = Object.keys(sheets);
  return Object.fromEntries(Object.entries({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    "xl/workbook.xml": `<workbook ${ns} xmlns:r="${rel}"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
    ...Object.fromEntries(Object.values(sheets).map((value, i) => [`xl/worksheets/sheet${i + 1}.xml`, value])),
    ...extra,
  }).map(([name, value]) => [name, typeof value === "string" ? strToU8(value) : value]));
}
const workbook = (sheets?: Record<string, string>, extra?: Record<string, string | Uint8Array>) => zipSync(members(sheets, extra));
const styles = `<styleSheet ${ns}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
const customerId = "00000000-0000-4000-8000-000000000001";
const mapping: CsvMapping = { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId };
const context = { customers: [{ id: customerId, name: "Mabuhay Cafe" }], invoices: [], expenses: [], bindings: [] };

// These fixtures encode literal worksheet values; no spreadsheet writer computes expectations.
describe("XLSX worksheet adapter", () => {
  it("lists sheets without reading an empty or invalid first worksheet", async () => {
    const bytes = workbook({ Empty: sheet(""), Invalid: sheet(data()), Invoices: sheet() });
    expect(await readXlsx(bytes)).toEqual({ sheets: ["Empty", "Invalid", "Invoices"], sheet: null, file: null });
    const result = await readXlsx(bytes, "Invoices");
    expect(result.sheet).toBe("Invoices");
    expect(result.file?.headers).toEqual(["ID", "Invoice", "Amount", "Due"]);
    await expect(readXlsx(bytes, "Missing")).rejects.toThrow(/sheet/i);
    await expect(readXlsx(bytes, "Empty")).rejects.toThrow();
    await expect(readXlsx(bytes, "Invalid")).rejects.toThrow();
  });

  it("reads the fictional invoice and bill sheets in a workbook without mixing their rows or sources", async () => {
    const bytes = fictionalWorkbookFixture();
    const invoices = await readXlsx(bytes, "Invoices");
    const bills = await readXlsx(bytes, "Bills");

    expect(invoices.sheet).toBe("Invoices");
    expect(invoices.file?.headers).toEqual(["ID", "Invoice", "Amount", "Due"]);
    expect(invoices.file?.rows).toEqual([
      ["INV-1001", "INV-1001", "1000", "2026-11-05"],
      ["INV-1002", "INV-1002", "2500", "2026-11-08"],
    ]);

    expect(bills.sheet).toBe("Bills");
    expect(bills.file?.headers).toEqual(["ID", "Vendor", "Amount", "Due"]);
    expect(bills.file?.rows).toEqual([
      ["BILL-2001", "Northwind Stockroom", "850", "2026-11-06"],
      ["BILL-2002", "City Utilities", "420", "2026-11-10"],
    ]);
  });

  it("reads 300 rows from selected invoice and bill tabs together with stable sheet and row references", async () => {
    const result = await readXlsxSheets(fictionalWorkbook300Fixture(), ["Invoices", "Bills"]);
    expect(MAX_WORKBOOK_DATA_ROWS).toBe(300);
    expect(result.selectedSheets).toEqual(["Invoices", "Bills"]);
    expect(result.file.rows).toHaveLength(300);
    expect(result.file.rowSheets).toHaveLength(300);
    expect(result.file.rowSheets!.slice(0, 150)).toEqual(Array(150).fill("Invoices"));
    expect(result.file.rowSheets!.slice(150)).toEqual(Array(150).fill("Bills"));
    expect(result.file.rowNumbers!.slice(0, 3)).toEqual([2, 3, 4]);
    expect(result.file.rows[0]).toContain("30000");
    expect(result.file.rows[1]).toContain("Settled");
    expect(result.file.rows[2]).toContain("11/15/2026");
  });

  it("holds a repeated stable source ID found on different selected sheets", async () => {
    const shared = data(2, "SHARED-1");
    const { file } = await readXlsxSheets(workbook({ Invoices: sheet(header + shared), Bills: sheet(header + shared) }), ["Invoices", "Bills"]);
    const rows = mapCsv(file, mapping, context);
    expect(rows.map(row => [row.sheet, row.row, row.status])).toEqual([
      ["Invoices", 2, "duplicate"], ["Bills", 2, "duplicate"],
    ]);
  });

  it("rejects workbooks over the aggregate data-row bound", async () => {
    await expect(readXlsxSheets(fictionalWorkbook300Fixture(151, 150), ["Invoices", "Bills"]))
      .rejects.toThrow(/300.*row/i);
  });

  it("maps the full 300-row workbook to exact ready totals and held source-linked exceptions", async () => {
    const { file } = await readXlsxSheets(fictionalWorkbook300Fixture(), ["Invoices", "Bills"]);
    const fields = suggestAutoFields(suggestColumns(file.headers, file.rows.slice(0, 20)));
    const mapping = {
      kind: "auto" as const, externalId: fields.externalId!, amount: fields.amount!, dueDate: fields.dueDate!, number: fields.number!,
      customerId, label: fields.label!, payee: fields.payee!, columns: file.headers, excludedIds: [], overrides: {}, ...fields,
    };
    const read = applyReader(file, mapping);
    const rows = mapCsv(read.file, read.mixed, context);
    const summary = summarizeWorkbookRows(rows);

    expect(rows.find(row => row.externalId === "INV-0005")).toMatchObject({ status: "new", message: "Review before applying." });
    expect(rows).toHaveLength(299);
    expect(read.payments).toEqual([5]);
    expect(rows.filter(row => row.status === "new")).toHaveLength(296);
    expect(rows.find(row => row.externalId === "INV-0001")).toMatchObject({ sheet: "Invoices", row: 2, status: "balance_review", openCents: 3000000 });
    expect(rows.find(row => row.externalId === "INV-0001")?.candidate).toBeUndefined();
    expect(rows.find(row => row.externalId === "INV-0002")).toMatchObject({ sheet: "Invoices", row: 3, status: "settled", openCents: 0 });
    expect(rows.find(row => row.externalId === "INV-0003")).toMatchObject({ sheet: "Invoices", row: 4, status: "invalid" });
    expect(summary).toMatchObject({ readyCount: 296, readyCents: 24364000, exceptionCount: 3, excludedOpenCount: 1, excludedOpenCents: 3000000 });
    expect(summary.groups).toEqual([
      expect.objectContaining({ sheet: "Invoices", readyCount: 146, readyCents: 15731500, exceptionCount: 3, excludedOpenCount: 1, excludedOpenCents: 3000000 }),
      expect.objectContaining({ sheet: "Bills", readyCount: 150, readyCents: 8632500, exceptionCount: 0 }),
    ]);
  });

  it("preserves text identifiers, unrounded numeric lexemes and physical row provenance", async () => {
    const { file } = await readXlsx(workbook({ Invoices: sheet(header + '<row r="2"/>' + data(7, "0001", "10.250") + data(8, "0002", "1.001")) }), "Invoices");
    expect(file?.rows).toEqual([["0001", "INV-0001", "10.250", "2026-11-05"], ["0002", "INV-0002", "1.001", "2026-11-05"]]);
    expect(file?.rowNumbers).toEqual([7, 8]);
    expect(file?.nonTextCells).toEqual([[false, false, true, false], [false, false, true, false]]);
    const mapped = mapCsv(file!, mapping, context);
    expect(mapped.map(row => [row.row, row.status])).toEqual([[7, "invalid"], [8, "invalid"]]);
    expect(mapped.every(row => row.candidate === undefined)).toBe(true);
  });

  it("has the same valid proposal and duplicate outcomes as CSV", async () => {
    const { file } = await readXlsx(workbook({ Invoices: sheet(header + data() + data(3)) }), "Invoices");
    const csv = readCsv(strToU8("ID,Invoice,Amount,Due\n0001,INV-0001,10.25,2026-11-05\n0001,INV-0001,10.25,2026-11-05"));
    expect(mapCsv(file!, mapping, context).map(row => { const copy = { ...row }; delete copy.sheet; return copy; })).toEqual(mapCsv(csv, mapping, context));
  });

  it("converts a date-formatted serial to a UTC date-only literal", async () => {
    const { file } = await readXlsx(workbook({ Invoices: sheet(header + data(2, "0001", "10.25", number("D2", "46331", 's="1"'))) }, { "xl/styles.xml": styles }), "Invoices");
    expect(file?.rows[0][3]).toBe("2026-11-05");
  });

  it.each(["46331.5", "1e999"])("rejects hidden time or invalid date serial %s", async serial => {
    await expect(readXlsx(workbook({ Invoices: sheet(header + data(2, "0001", "1", number("D2", serial, 's="1"'))) }, { "xl/styles.xml": styles }), "Invoices")).rejects.toThrow();
  });

  it("holds numeric identifiers instead of silently accepting formatted leading zeroes", async () => {
    const row = data().replace(text("A2", "0001"), number("A2", "1"));
    const { file } = await readXlsx(workbook({ Invoices: sheet(header + row) }), "Invoices");
    expect(mapCsv(file!, mapping, context)[0]).toMatchObject({ status: "invalid", externalId: "1" });
    expect(mapCsv(file!, mapping, context)[0].message).toMatch(/text/i);
  });

  it.each(["<f>1+1</f>", "<f>1+1</f><v>2</v>", '<f t="shared" si="0"/><v>2</v>'])("rejects formulas regardless of cached results: %s", async formula => {
    await expect(readXlsx(workbook({ Invoices: sheet(header + data().replace(number("C2", "10.25"), `<c r="C2">${formula}</c>`)) }), "Invoices")).rejects.toThrow(/formula/i);
  });

  it.each([sheet(data()), sheet(header), sheet(header + Array.from({ length: 101 }, (_, i) => data(i + 2, String(i))).join("")), sheet(header + data(2, "x".repeat(17000)))])("enforces shared header, row and record limits", async xml => {
    await expect(readXlsx(workbook({ Invoices: xml }), "Invoices")).rejects.toThrow();
  });
});

describe("XLSX hostile input boundaries", () => {
  it("rejects empty, non-ZIP, corrupt, truncated and oversized uploads", async () => {
    const bytes = workbook();
    const corrupt = bytes.slice();
    corrupt[40] ^= 0xff;
    for (const input of [new Uint8Array(), strToU8("not an xlsx"), bytes.slice(0, -1), bytes.slice(0, -22), corrupt, new Uint8Array(512 * 1024 + 1)]) await expect(readXlsx(input, "Invoices")).rejects.toThrow();
  });

  it("enforces actual expansion before passing members to the reader", async () => {
    const huge = workbook(undefined, { "oversized.xml": `<x>${"a".repeat(2 * 1024 * 1024)}</x>` });
    expect(huge.length).toBeLessThan(512 * 1024);
    await expect(readXlsx(huge, "Invoices")).rejects.toThrow(/expanded|large|limit/i);
    const aggregate = workbook(undefined, Object.fromEntries([1, 2, 3].map(i => [`padding${i}.xml`, `<x>${"a".repeat(1800000)}</x>`])));
    await expect(readXlsx(aggregate, "Invoices")).rejects.toThrow(/expanded|large|limit/i);
  });

  it.each(['<row r="1000000000"/>', '<row r="&#49;000000000"/>', '<row r="1"><c r="XFD1"><v>1</v></c></row>', '<row r="1"><c r="Y1"><v>1</v></c></row>', '<row r="1001"/>', '<row r="1"><c r="A&#49;000000000"><v>1</v></c></row>'])("bounds sparse worksheet coordinates %s", async xml => {
    await expect(readXlsx(workbook({ Invoices: sheet(xml) }), "Invoices")).rejects.toThrow();
  });

  it("rejects excess sheets and archive entries", async () => {
    await expect(readXlsx(workbook(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`Sheet${i}`, sheet()]))))).rejects.toThrow();
    await expect(readXlsx(workbook(undefined, Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`file${i}.xml`, "<x/>"]))))).rejects.toThrow();
  });

  it.each(["../evil.xml", "/evil.xml", "xl/../evil.xml", "xl\\evil.xml"])("rejects unsafe archive member %s", async path => {
    await expect(readXlsx(workbook(undefined, { [path]: "<x/>" }))).rejects.toThrow();
  });

  it.each(["<worksheet><sheetData></worksheet>", '<!DOCTYPE worksheet [<!ENTITY a "b">]><worksheet/>', '<worksheet a="1" a="2"/>', '<worksheet>&unknown;</worksheet>', '<worksheet>\u0001</worksheet>'])("rejects malformed or unsupported XML %s", async xml => {
    await expect(readXlsx(workbook({ Invoices: xml }))).rejects.toThrow();
  });

  it("rejects invalid UTF-8 in XML", async () => {
    await expect(readXlsx(workbook(undefined, { "bad.xml": new Uint8Array([0xff]) }))).rejects.toThrow();
  });

  it.each(["xl/vbaProject.bin", "xl/externalLinks/externalLink1.xml"])("rejects macros and external-workbook parts %s", async path => {
    await expect(readXlsx(workbook(undefined, { [path]: "<x/>" }))).rejects.toThrow();
  });

  it("rejects external workbook relationships and macro content types", async () => {
    await expect(readXlsx(workbook(undefined, { "xl/_rels/evil.xml.rels": `<Relationships><Relationship Id="x" Type="${rel}/externalLink" Target="file:///other.xlsx" TargetMode="External"/></Relationships>` }))).rejects.toThrow();
    await expect(readXlsx(workbook(undefined, { "[Content_Types].xml": '<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>' }))).rejects.toThrow();
  });
});

describe("XLSX ZIP integrity and XML parser agreement", () => {
  it("rejects changed stored data with a stale CRC", async () => {
    const bytes = zipSync(members(), { level: 0 });
    const marker = strToU8("INV-0001");
    const offset = Buffer.from(bytes).indexOf(marker);
    expect(offset).toBeGreaterThan(0);
    bytes[offset] = "X".charCodeAt(0);
    await expect(readXlsx(bytes, "Invoices")).rejects.toThrow(/valid|corrupt/i);
  });

  it("rejects duplicate local and central member names", async () => {
    const bytes = workbook(undefined, { "one.xml": "<x/>", "two.xml": "<x/>" });
    const patched = Buffer.from(bytes);
    for (let offset = patched.indexOf("two.xml"); offset >= 0; offset = patched.indexOf("two.xml", offset + 7)) patched.write("one.xml", offset, "utf8");
    await expect(readXlsx(patched, "Invoices")).rejects.toThrow();
  });

  it("rejects unsupported compression and encryption flags", async () => {
    for (const change of ["method", "encrypted"]) {
      const bytes = workbook(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const central = view.getUint32(bytes.length - 6, true);
      if (change === "method") { view.setUint16(8, 99, true); view.setUint16(central + 10, 99, true); }
      else { view.setUint16(6, view.getUint16(6, true) | 1, true); view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true); }
      await expect(readXlsx(bytes)).rejects.toThrow();
    }
  });

  it("bounds actual expansion even when declared uncompressed size lies", async () => {
    const bytes = workbook({ Invoices: `<x>${"a".repeat(2500000)}</x>` });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let central = view.getUint32(bytes.length - 6, true);
    while (view.getUint32(central, true) === 0x02014b50) {
      const length = view.getUint16(central + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + length));
      if (name.endsWith("sheet1.xml")) {
        view.setUint32(central + 24, 1, true);
        view.setUint32(view.getUint32(central + 42, true) + 22, 1, true);
      }
      central += 46 + length + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
    }
    await expect(readXlsx(bytes)).rejects.toThrow(/expanded|limit/i);
  });

  it.each(['<row xmlns:x="urn:test" x:r="1000000000"/>', '<row r="1" xmlns:x="urn:test"><c x:r="XFD1000000000"><v>1</v></c></row>', '<row r="1" xmlns:x="urn:test" x:r="2"/>', '<row r="1"><c r="A1" t="str"><v>cached</v></c></row>'])("rejects prefixed or ambiguous attributes and implicit formula strings %s", async rows => {
    await expect(readXlsx(workbook({ Invoices: sheet(rows) }))).rejects.toThrow();
  });

  it.each(["<x/><!--ok--><y/>", "<x a=no/>", "<x>&#0;</x>", "<x>&#x110000;</x>", "<x/><!--unterminated", ""])("rejects malformed XML members %s", async xml => {
    await expect(readXlsx(workbook(undefined, { "bad.xml": xml }))).rejects.toThrow();
  });

  it("rejects macro sheet content types under an unrelated member name", async () => {
    await expect(readXlsx(workbook(undefined, { "[Content_Types].xml": '<Types><Override ContentType="application/vnd.ms-excel.macrosheet+xml"/></Types>' }))).rejects.toThrow();
  });

  it.each(["2026-02-30", "2026-11-05T12:00:00Z", "2026-11-05T00:00:00+08:00"])("rejects invalid calendar or time-bearing native date %s", async raw => {
    await expect(readXlsx(workbook({ Invoices: sheet(header + data(2, "0001", "1", `<c r="D2" t="d"><v>${raw}</v></c>`)) }), "Invoices")).rejects.toThrow();
  });
});

describe("bounded custom Excel number formats", () => {
  const customStyles = (formatCode: string) => `<styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="${formatCode}"/></numFmts><cellXfs count="1"><xf numFmtId="164"/></cellXfs></styleSheet>`;

  it.each(["[".repeat(32000), "&#91;".repeat(257)])("rejects oversized decoded format strings before the reader", async format => {
    const bytes = workbook({ Invoices: sheet(header + data(2, "0001", "1", number("D2", "46331", 's="0"'))) }, { "xl/styles.xml": customStyles(format) });
    await expect(readXlsx(bytes, "Invoices")).rejects.toThrow(/format|limit/i);
  });

  it("retains ordinary custom date formats", async () => {
    const bytes = workbook({ Invoices: sheet(header + data(2, "0001", "1", number("D2", "46331", 's="0"'))) }, { "xl/styles.xml": customStyles("yyyy-mm-dd") });
    const result = await readXlsx(bytes, "Invoices");
    expect(result.file?.rows[0][3]).toBe("2026-11-05");
    expect(mapCsv(result.file!, mapping, context)[0]).toMatchObject({ status: "new", candidate: { payload: { dueDate: "2026-11-05", amountCents: 100 } } });
  });
});

describe("XLSX unsupported values and ordinary workbook features", () => {
  const book = (pr: string) => ({ "xl/workbook.xml": `<workbook ${ns} xmlns:r="${rel}">${pr}<sheets><sheet name="Invoices" sheetId="1" r:id="rId1"/></sheets></workbook>`, "xl/styles.xml": styles });

  it.each(['<c r="C2" t="e"><v>#REF!</v></c>', '<c r="C2" t="e"><v>#N/A</v></c>', '<c r="C2" t="b"><v>1</v></c>'])("holds Excel error and TRUE/FALSE cells instead of reading them as blank or text: %s", async cell => {
    const xml = sheet(header + data().replace(number("C2", "10.25"), cell));
    await expect(readXlsx(workbook({ Invoices: xml }), "Invoices")).rejects.toThrow(/error values|TRUE\/FALSE/);
  });

  it("reads date serials with the declared 1904 date system and rejects unrecognized date-system values", async () => {
    const xml = sheet(header + data(2, "0001", "1", number("D2", "46336", 's="1"')));
    expect((await readXlsx(workbook({ Invoices: xml }, book('<workbookPr date1904="1"/>')), "Invoices")).file?.rows[0][3]).toBe("2030-11-11");
    expect((await readXlsx(workbook({ Invoices: xml }, book('<workbookPr date1904="false"/>')), "Invoices")).file?.rows[0][3]).toBe("2026-11-10");
    await expect(readXlsx(workbook({ Invoices: xml }, book('<workbookPr date1904="true"/>')), "Invoices")).rejects.toThrow(/date system/i);
  });

  it("accepts column formatting, styled blank cells, hyperlinks, chart references and conditional formatting", async () => {
    const xml = `<worksheet ${ns} xmlns:r="${rel}"><dimension ref="A1:Z2"/><cols><col min="6" max="16384" width="9" customWidth="1"/></cols><sheetData>${header}${data().replace("</row>", '<c r="Z2" s="0"/></row>')}</sheetData>`
      + '<conditionalFormatting sqref="C2"><cfRule type="expression" priority="1"><formula>C2&gt;0</formula></cfRule></conditionalFormatting><hyperlinks><hyperlink ref="A2" r:id="rId1"/></hyperlinks></worksheet>';
    const extra = {
      "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/hyperlink" Target="mailto:billing@example.test" TargetMode="External"/></Relationships>`,
      "xl/charts/chart1.xml": '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:f>Invoices!$C$2</c:f></c:chartSpace>',
    };
    const { file } = await readXlsx(workbook({ Invoices: xml }, extra), "Invoices");
    expect(file?.headers).toEqual(["ID", "Invoice", "Amount", "Due"]);
    expect(file?.rows).toEqual([["0001", "INV-0001", "10.25", "2026-11-05"]]);
  });

  it("explains data placed beyond column X", async () => {
    await expect(readXlsx(workbook({ Invoices: sheet(header + data().replace("</row>", '<c r="Y2"><v>1</v></c></row>')) }), "Invoices")).rejects.toThrow(/columns A–X/);
  });
});
