import { readFileSync } from "node:fs";
import { readXlsx } from "./xlsx";
import { describe, expect, it } from "vitest";
import { readCsv, mapCsv, csvMappingSchema, CSV_LIMITS, type CsvMapping } from "./imports";

const customerId = "00000000-0000-4000-8000-000000000001";
const mapping: CsvMapping = { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId, currency: "Currency" };
const context = { customers: [{ id: customerId }], invoices: [], expenses: [], bindings: [] };
const csv = (text: string) => readCsv(new TextEncoder().encode(text));

describe("bounded CSV proposals", () => {
  it("handles UTF-8 BOM, quoted commas, escaped quotes and multiline cells", () => {
    const file = csv('\uFEFFID,Invoice,Amount,Due,Currency\r\na,"INV,\"\"A\"\"\n2026",10.25,2026-11-05,PHP\r\n');
    const row = mapCsv(file, mapping, context)[0];
    expect(row.status).toBe("new");
    expect(row.candidate?.payload).toMatchObject({ number: 'INV,"A"\n2026', amountCents: 1025, customerId });
  });

  it("identifies changed and unchanged invoices using saved values", () => {
    const file = csv("ID,Invoice,Amount,Due,Currency\na,INV-A,10.00,2026-11-05,PHP\nb,INV-B,12.00,2026-11-05,PHP");
    const invoices = ["INV-A", "INV-B"].map((number, index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 2}`, number, customer_id: customerId, amount_cents: 1000, due_date: "2026-11-05" }));
    expect(mapCsv(file, mapping, { ...context, invoices }).map(row => row.status)).toEqual(["unchanged", "changed"]);
  });

  it("holds every occurrence of duplicate IDs and invoice identities", () => {
    const file = csv("ID,Invoice,Amount,Due,Currency\na,INV-A,1,2026-11-05,PHP\na,INV-B,2,2026-11-05,PHP\nb,INV-C,3,2026-11-05,PHP\nc,INV-C,4,2026-11-05,PHP");
    expect(mapCsv(file, mapping, context).every(row => row.status === "duplicate")).toBe(true);
  });

  it("rejects invalid money, currency, dates, missing IDs and row widths without accepting other fields", () => {
    const file = csv("ID,Invoice,Amount,Due,Currency\na,A,1.001,2026-11-05,PHP\nb,B,1,2026-02-30,PHP\nc,C,1,2026-11-05,USD\n,D,1,2026-11-05,PHP\ne,E,1,2026-11-05,PHP,extra\nf,F,999999999999,2026-11-05,PHP");
    expect(mapCsv(file, mapping, context).map(row => row.status)).toEqual(Array(6).fill("invalid"));
    expect(() => mapCsv(file, { ...mapping, customerId: "unrelated" }, context)).toThrow();
  });

  it("requires explicit existing customer mapping and preserves leading-zero IDs", () => {
    const file = csv("ID,Invoice,Amount,Due,Currency\n0001,INV-A,1,2026-11-05,PHP");
    expect(mapCsv(file, mapping, context)[0].externalId).toBe("0001");
    expect(() => mapCsv(file, { ...mapping, amount: "Missing" }, context)).toThrow();
  });

  it("resolves an exact imported customer name to its existing business ID", () => {
    const file = csv("ID,Customer,Invoice,Amount,Due\nrow-1,Mabuhay Cafe,INV-1,500,2026-11-15");
    const result = mapCsv(file, { ...mapping, currency: undefined, customer: "Customer" }, { ...context, customers: [{ id: customerId, name: "Mabuhay Cafe" }] })[0];
    expect(result.status).toBe("new");
    expect(result.candidate?.payload).toMatchObject({ customerId });
  });

  it("uses a previous source binding when an expense changes, rather than creating another bill", () => {
    const expenseId = "00000000-0000-4000-8000-000000000002";
    const file = csv("ID,Label,Payee,Amount,Due\n0001,Changed bill,Vendor,12,2026-11-05");
    const rows = mapCsv(file, { kind: "expense", externalId: "ID", label: "Label", payee: "Payee", amount: "Amount", dueDate: "Due" }, {
      ...context, expenses: [{ id: expenseId, label: "Old bill", payee: "Vendor", amount_cents: 1000, due_date: "2026-11-05" }],
      bindings: [{ externalId: "0001", type: "save_expense", recordId: expenseId }],
    });
    expect(rows[0].status).toBe("changed");
    expect(rows[0].candidate?.payload.id).toBe(expenseId);
  });

  it("rejects empty, duplicate-header, malformed, invalid UTF-8 and oversized files before staging", () => {
    for (const input of ["", "ID,ID\na,b", 'ID,Name\na,"unterminated', "ID\na\0b", `ID\n${"x\n".repeat(CSV_LIMITS.rows + 1)}`]) expect(() => csv(input)).toThrow();
    expect(() => readCsv(new Uint8Array([0xff]))).toThrow();
    expect(() => readCsv(new Uint8Array(CSV_LIMITS.bytes + 1))).toThrow();
  });
});

it("holds numeric spreadsheet identifiers instead of silently dropping their formatting", () => {
  const file = { ...csv("ID,Invoice,Amount,Due,Currency\n1,INV-A,10.00,2026-11-05,PHP"), nonTextCells: [[true, false, true, false, false]] };
  const [row] = mapCsv(file, mapping, context);
  expect(row.status).toBe("invalid");
  expect(row.message).toMatch(/text/i);
  expect(row.candidate).toBeUndefined();
});

it("retains physical worksheet row numbers after empty rows are omitted", () => {
  const file = { ...csv("ID,Invoice,Amount,Due,Currency\n0001,INV-A,10.00,2026-11-05,PHP"), rowNumbers: [7] };
  expect(mapCsv(file, mapping, context)[0].row).toBe(7);
});

it("produces the same literal proposals from the matching CSV and Excel samples", async () => {
  const csvRows = mapCsv(readCsv(readFileSync("public/samples/pondopath-invoices.csv")), mappingForSample(), context);
  const workbook = await readXlsx(readFileSync("public/samples/pondopath-invoices.xlsx"), "Invoices");
  const excelRows = mapCsv(workbook.file!, mappingForSample(), context);
  expect(excelRows.map(row => row.status)).toEqual(["new", "new", "invalid", "duplicate", "duplicate"]);
  expect(excelRows[0].candidate?.payload).toMatchObject({ number: "SAMPLE-INV-001", amountCents: 1_250_000, dueDate: "2026-11-10" });
  expect(excelRows.map(row => { const copy = { ...row }; delete copy.sheet; return copy; })).toEqual(csvRows);
});

function mappingForSample(): CsvMapping {
  return { kind: "invoice", externalId: "Source ID", number: "Invoice number", amount: "Amount PHP", dueDate: "Original due", customerId, currency: "Currency" };
}

describe("mixed mapping and row filter", () => {
  const mixed = {
    kind: "mixed", externalId: "ID", amount: "Amount", dueDate: "Due", typeColumn: "Type",
    invoiceValues: ["Invoice", "AR"], expenseValues: ["Bill"],
    number: "Invoice", customerId, label: "Label", payee: "Payee",
  } as CsvMapping;
  const sheet = (rows: string) => csv(`ID,Type,Invoice,Label,Payee,Amount,Due,Status\n${rows}`);

  it("routes each row by its Type value", () => {
    const rows = mapCsv(sheet("a,Invoice,INV-A,,,10.00,2026-11-05,Unpaid\nb, bill ,,Rent,Landlord,20.00,2026-11-06,Unpaid"), mixed, context);
    expect(rows.map(row => row.candidate?.type)).toEqual(["save_invoice", "save_expense"]);
    expect(rows[1].candidate?.payload).toMatchObject({ label: "Rent", payee: "Landlord", amountCents: 2000 });
  });

  it("marks an unknown Type invalid", () => {
    const [row] = mapCsv(sheet("a,Misc,INV-A,,,10.00,2026-11-05,Unpaid"), mixed, context);
    expect(row).toMatchObject({ status: "invalid", message: "Unknown type 'Misc'." });
  });

  it("rejects overlapping Type value lists", async () => {
    const { csvMappingSchema } = await import("./imports");
    expect(csvMappingSchema.safeParse(mixed).success).toBe(true);
    expect(csvMappingSchema.safeParse({ ...mixed, invoiceValues: ["AR"], expenseValues: [" ar"] }).success).toBe(false);
  });

  it("skips rows that do not match the filter, trimming and ignoring case", () => {
    const filtered = { ...mixed, filter: { column: "Status", value: "Unpaid" } } as CsvMapping;
    const rows = mapCsv(sheet("a,Invoice,INV-A,,,10.00,2026-11-05, unpaid \nb,Invoice,INV-B,,,10.00,2026-11-05,TRUE\nb,Invoice,INV-C,,,10.00,2026-11-05,Paid"), filtered, context);
    expect(rows.map(row => row.status)).toEqual(["new", "filtered", "filtered"]);
    expect(rows[1].candidate).toBeUndefined();
  });

  it("keeps the existing kind error when an applied row's kind changes", () => {
    const bindings = [{ externalId: "a", type: "save_invoice", recordId: "00000000-0000-4000-8000-000000000009" }];
    const [row] = mapCsv(sheet("a,Bill,,Rent,Landlord,20.00,2026-11-06,Unpaid"), mixed, { ...context, bindings });
    expect(row).toMatchObject({ status: "invalid", message: "This source ID already belongs to a different record kind." });
  });
});

describe("workbook balance and date exceptions", () => {
  it("holds partly paid rows and excludes settled rows without creating financial proposals", () => {
    const file = csv("ID,Invoice,Amount,Paid,Open Balance,Status,Due,Currency\n" +
      "partial,INV-PARTIAL,50000,20000,30000,Partially Paid,2026-11-15,PHP\n" +
      "settled,INV-SETTLED,50000,50000,0,Settled,2026-11-15,PHP");
    const balanceMapping = { ...mapping, paidAmount: "Paid", openBalance: "Open Balance", status: "Status" } as CsvMapping;
    const rows = mapCsv(file, balanceMapping, context);
    expect(rows.map(({ status, candidate }) => [status, candidate])).toEqual([
      ["balance_review", undefined], ["settled", undefined],
    ]);
    expect(rows[0].message).toMatch(/open balance|partly paid/i);
    expect(rows[1].message).toMatch(/settled|paid/i);
  });

  it("holds partly paid bills and excludes settled bills without staging either", () => {
    const file = csv("ID,Label,Payee,Amount,Paid,Open Balance,Status,Due,Currency\n" +
      "bill-1,Office Rent,Landlord,25000,25000,0,Paid,2026-11-15,PHP\n" +
      "bill-2,Utilities,Meralco,8000,0,8000,Pending,2026-11-15,PHP\n" +
      "bill-3,Stock order,Northwind,50000,20000,30000,Partially Paid,2026-11-15,PHP");
    const expenseMapping = {
      kind: "expense" as const,
      externalId: "ID",
      label: "Label",
      payee: "Payee",
      amount: "Amount",
      paidAmount: "Paid",
      openBalance: "Open Balance",
      status: "Status",
      dueDate: "Due",
      currency: "Currency",
    };
    const rows = mapCsv(file, expenseMapping, context);
    expect(rows[0]).toMatchObject({ status: "settled", openCents: 0 });
    expect(rows[0].candidate).toBeUndefined();
    expect(rows[0].message).toMatch(/settled bill excluded/i);
    expect(rows[1]).toMatchObject({ status: "new" });
    expect(rows[1].candidate).toBeDefined();
    expect(rows[2]).toMatchObject({ status: "balance_review", openCents: 3_000_000 });
    expect(rows[2].candidate).toBeUndefined();
  });

  it("keeps ambiguous dates out of proposals and identifies the source row", () => {
    const file = csv("ID,Invoice,Amount,Due,Currency\nambiguous,INV-A,100,11/15/2026,PHP");
    const [row] = mapCsv(file, mapping, context);
    expect(row).toMatchObject({ row: 2, status: "invalid" });
    expect(row.candidate).toBeUndefined();
    expect(row.message).toMatch(/date|YYYY-MM-DD/i);
  });
});

describe("auto mapping", () => {
  const auto = { kind: "auto", externalId: "ID", amount: "Amount", dueDate: "Due", number: "Invoice", customerId, label: "Label", payee: "Payee",
    columns: ["ID", "Amount", "Due", "Invoice", "Label", "Payee"], excludedIds: [], overrides: {} };
  it("auto mapping parses and older mappings still parse", () => {
    expect(csvMappingSchema.safeParse(auto).success).toBe(true);
    expect(csvMappingSchema.safeParse(mapping).success).toBe(true);
    expect(csvMappingSchema.safeParse({ ...auto, columns: Array.from({ length: 25 }, (_, i) => "C" + i) }).success).toBe(false);
    expect(csvMappingSchema.safeParse({ ...auto, excludedIds: Array.from({ length: 501 }, (_, i) => "R" + i) }).success).toBe(false);
  });
  it("requires mapped columns to be ticked", () => {
    expect(csvMappingSchema.safeParse({ ...auto, columns: ["ID", "Amount", "Due", "Invoice", "Label"] }).success).toBe(false);
  });
  it("mapCsv refuses an auto mapping directly", () => {
    expect(() => mapCsv(csv("ID,Amount\n1,2"), auto as unknown as CsvMapping, context)).toThrow("Use the reader first.");
  });
});
