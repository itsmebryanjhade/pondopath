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
