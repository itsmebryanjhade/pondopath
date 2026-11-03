import { describe, expect, it } from "vitest";
import { readCsv, mapCsv, CSV_LIMITS, type CsvMapping } from "./imports";

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
