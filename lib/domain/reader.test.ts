import { describe, expect, it } from "vitest";
import { suggestColumns } from "./reader";

const roles = (headers: string[], samples: string[][] = []) =>
  suggestColumns(headers, samples).map(({ header, role, confidence }) => [header, role, confidence]);

describe("column detection", () => {
  it("matches English headers", () => {
    expect(roles(["Invoice No", "Customer", "Amount", "Due Date", "Type"])).toEqual([
      ["Invoice No", "number", "high"], ["Customer", "customer", "high"], ["Amount", "amount", "high"],
      ["Due Date", "dueDate", "high"], ["Type", "type", "high"],
    ]);
  });

  it("matches Filipino and Taglish headers", () => {
    expect(roles(["Petsa", "Kliyente", "Halaga", "Supplier", "Uri", "Paliwanag"]).map(([, role]) => role))
      .toEqual(["date", "customer", "amount", "supplier", "type", "description"]);
  });

  it("uses value shapes when the header is unknown", () => {
    expect(roles(["Col7"], [["15000"], ["8250.50"]])).toEqual([["Col7", "amount", "low"]]);
    expect(roles(["Col8"], [["2026-11-20"], ["2026-12-01"]])).toEqual([["Col8", "date", "low"]]);
  });

  it("leaves unknown text columns as ignore", () => {
    expect(roles(["Notes"], [["call first"], ["ok"]])).toEqual([["Notes", "ignore", "low"]]);
  });

  it("never assigns a role twice", () => {
    expect(roles(["Amount", "Total"]).map(([, role]) => role)).toEqual(["amount", "ignore"]);
    expect(roles(["Col1", "Halaga"], [["100", "200"]]).map(([, role]) => role)).toEqual(["ignore", "amount"]);
  });

  it("picks a stable ID column", () => {
    for (const header of ["Ref", "ID", "SRC-ID"])
      expect(roles([header, "Amount"], [["SRC-0001", "100"], ["SRC-0002", "200"]])[0]).toEqual([header, "externalId", "high"]);
  });
});

import { labelRows, applyReader } from "./reader";
import { csvMappingSchema, mapCsv, type CsvFile } from "./imports";

const customerId = "00000000-0000-4000-8000-000000000001";
const headers = ["ID", "Type", "Customer", "Supplier", "Description", "Amount", "Due", "Invoice No"];
const auto = (extra: Record<string, unknown> = {}) => csvMappingSchema.parse({
  kind: "auto", externalId: "ID", amount: "Amount", dueDate: "Due", number: "Invoice No", customerId, customer: "Customer", label: "Description", payee: "Supplier",
  typeColumn: "Type", columns: headers, excludedIds: [], overrides: {}, ...extra,
}) as Extract<ReturnType<typeof csvMappingSchema.parse>, { kind: "auto" }>;
const file = (rows: string[][], h = headers): CsvFile => ({ headers: h, rows, rowNumbers: rows.map((_, i) => i + 2) });
const row = (id: string, type: string, customer: string, supplier: string, description: string, amount = "100") =>
  [id, type, customer, supplier, description, amount, "2026-11-20", "INV-" + id];
const labels = (f: CsvFile, m = auto()) => labelRows(f, m).map(({ externalId, label }) => [externalId, label]);
const context = { customers: [{ id: customerId }], invoices: [], expenses: [], bindings: [] };

describe("row labels", () => {
  it("labels by Type words", () => {
    expect(labels(file([row("A", "Invoice", "", "", ""), row("B", "Benta", "", "", ""), row("C", "Bill", "", "", ""),
      row("D", "Gastos", "", "", ""), row("E", "Payment", "", "", ""), row("F", "Bayad", "", "", "")]))).toEqual([
      ["A", "invoice"], ["B", "invoice"], ["C", "expense"], ["D", "expense"], ["E", "payment"], ["F", "payment"]]);
  });

  it("labels by party column", () => {
    expect(labels(file([row("A", "", "Mabuhay Cafe", "", ""), row("B", "", "", "Juan Supplies", "")]))).toEqual([["A", "invoice"], ["B", "expense"]]);
  });

  it("negative amount means expense", () => {
    expect(labels(file([row("A", "", "", "", "Rent", "-500")]))).toEqual([["A", "expense"]]);
  });

  it("payment words in the description mean payment", () => {
    expect(labels(file([row("A", "", "", "", "Resibo #12"), row("B", "", "", "", "paid via GCash")]))).toEqual([["A", "payment"], ["B", "payment"]]);
  });

  it("conflicting signals become choose with a reason naming both", () => {
    const [result] = labelRows(file([row("A", "Invoice", "", "Juan Supplies", "")]), auto());
    expect(result.label).toBe("choose");
    expect(result.reason).toContain("Invoice");
    expect(result.reason).toContain("Supplier");
  });

  it("rows with no signal become choose", () => {
    expect(labels(file([row("A", "Misc", "", "", "")]))).toEqual([["A", "choose"]]);
  });

  it("overrides win and follow the ID after re-sorting", () => {
    const rows = [row("SRC-0001", "Invoice", "", "", ""), row("SRC-0002", "Invoice", "", "", ""), row("SRC-0003", "", "", "", "")];
    const m = auto({ overrides: { "SRC-0003": "expense" }, excludedIds: ["SRC-0002"] });
    for (const order of [rows, [...rows].reverse()]) {
      expect(labels(file(order), m).find(([id]) => id === "SRC-0003")).toEqual(["SRC-0003", "expense"]);
      expect(applyReader(file(order), m).file.rows.map(values => values[0]).sort()).toEqual(["SRC-0001", "SRC-0003"]);
    }
  });

  it("duplicate IDs reach mapCsv so both are reported, even with an override", () => {
    const m = auto({ overrides: { "SRC-0005": "invoice" } });
    const read = applyReader(file([row("SRC-0005", "Invoice", "", "", ""), row("SRC-0005", "Invoice", "", "", "", "200")]), m);
    const statuses = mapCsv(read.file, read.mixed, context).map(item => item.status);
    expect(statuses).toEqual(["duplicate", "duplicate"]);
  });

  it("applyReader never passes payment or choose rows and reports their row numbers", () => {
    const read = applyReader(file([row("A", "Invoice", "", "", ""), row("B", "Payment", "", "", ""), row("C", "Misc", "", "", ""), row("D", "", "", "Landlord Co", "Rent", "-500")]), auto());
    expect(read.file.rows.map(values => values[0])).toEqual(["A", "D"]);
    expect(read.payments).toEqual([3]);
    expect(read.choose).toEqual([4]);
    const mapped = mapCsv(read.file, read.mixed, context);
    expect(mapped.map(item => [item.externalId, item.candidate?.type, item.candidate?.payload.amountCents])).toEqual([["A", "save_invoice", 10000], ["D", "save_expense", 50000]]);
  });

  it("keeps only the ticked columns", () => {
    const read = applyReader(file([row("A", "Invoice", "", "", "")]), auto({ columns: headers.filter(h => h !== "Supplier" && h !== "Customer"), customer: undefined, payee: "Description" }));
    expect(read.file.headers).toEqual(["ID", "Type", "Description", "Amount", "Due", "Invoice No", "__pondopath_type"]);
  });
});
