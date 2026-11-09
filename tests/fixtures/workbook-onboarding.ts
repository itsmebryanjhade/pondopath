import { zipSync } from "fflate";

const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const columnRef = (index: number) => String.fromCharCode(65 + index % 26) + (index >= 26 ? String(Math.floor(index / 26) + 1) : "");

const cell = (ref: string, value: string | number, kind: "text" | "number" = "text") => {
  if (kind === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
};

const row = (values: Array<string | number>, rowIndex: number) => {
  const cells = values.map((value, colIndex) => cell(`${columnRef(colIndex)}${rowIndex}`, value, typeof value === "number" ? "number" : "text"));
  return `<row r="${rowIndex}">${cells.join("")}</row>`;
};

const worksheet = (rows: Array<Array<string | number>>) => `<worksheet ${ns}><sheetData>${rows.map((values, index) => row(values, index + 1)).join("")}</sheetData></worksheet>`;

function packWorkbook(sheets: Record<string, string>) {
  const names = Object.keys(sheets);
  const entries = Object.entries({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    "xl/workbook.xml": `<workbook ${ns} xmlns:r="${rel}"><sheets>${names.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`,
    ...Object.fromEntries(names.map((name, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheets[name]])),
  });
  return zipSync(Object.fromEntries(entries.map(([filename, value]) => [filename, new TextEncoder().encode(value)])));
}

export function fictionalWorkbookFixture() {
  const sheets: Record<string, string> = {
    Invoices: worksheet([
      ["ID", "Invoice", "Amount", "Due"],
      ["INV-1001", "INV-1001", 1000, "2026-11-05"],
      ["INV-1002", "INV-1002", 2500, "2026-11-08"],
    ]),
    Bills: worksheet([
      ["ID", "Vendor", "Amount", "Due"],
      ["BILL-2001", "Northwind Stockroom", 850, "2026-11-06"],
      ["BILL-2002", "City Utilities", 420, "2026-11-10"],
    ]),
  };

  return packWorkbook(sheets);
}

export function fictionalWorkbook300Fixture(invoiceCount = 150, billCount = 150, customerName = "Mabuhay Cafe") {
  const headers = ["ID", "Type", "Customer", "Supplier", "Description", "Amount", "Paid", "Open Balance", "Status", "Due"];
  const invoices = Array.from({ length: invoiceCount }, (_, index) => {
    const number = index + 1;
    if (number === 1) return ["INV-0001", "Invoice", customerName, "", "Partly paid order", 50000, 20000, 30000, "Partially Paid", "2026-11-15"];
    if (number === 2) return ["INV-0002", "Invoice", customerName, "", "Settled order", 50000, 50000, 0, "Settled", "2026-11-15"];
    if (number === 3) return ["INV-0003", "Invoice", customerName, "", "Ambiguous date order", 1003, 0, 1003, "Open", "11/15/2026"];
    if (number === 4) return ["RCPT-0001", "Payment", "", "", "Earlier receipt in opening cash", 20000, 20000, 0, "Paid", "2026-10-28"];
    return [`INV-${String(number).padStart(4, "0")}`, "Invoice", customerName, "", `Order ${number}`, 1000 + number, 0, 1000 + number, "Open", "2026-11-15"];
  });
  const bills = Array.from({ length: billCount }, (_, index) => {
    const number = index + 1;
    return [`BILL-${String(number).padStart(4, "0")}`, "Bill", "", "Northwind Supply", `Stock ${number}`, 500 + number, 0, 500 + number, "Open", "2026-11-18"];
  });
  return packWorkbook({
    Invoices: worksheet([headers, ...invoices]),
    Bills: worksheet([headers, ...bills]),
  });
}
