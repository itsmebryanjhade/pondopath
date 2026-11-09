import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportSelector, readSelectorForm, relabel, selectorProblems, type SelectorLabel } from "@/components/import-selector";

const customerId = "00000000-0000-4000-8000-000000000001";
const headers = ["ID", "Type", "Customer", "Supplier", "Amount", "Due"];
const rows = [["SRC-1", "Invoice", "Cafe", "", "100", "2026-11-20"], ["SRC-2", "Bill", "", "Juan", "50", "2026-11-21"], ["SRC-3", "Bayad", "", "", "20", "2026-11-22"], ["SRC-4", "Misc", "", "", "10", "2026-11-23"]];
const labels: SelectorLabel[] = [
  { row: 2, externalId: "SRC-1", label: "invoice", reason: "Type says “Invoice”" }, { row: 3, externalId: "SRC-2", label: "expense", reason: "Type says “Bill”" },
  { row: 4, externalId: "SRC-3", label: "payment", reason: "Type says “Bayad”" }, { row: 5, externalId: "SRC-4", label: "choose", reason: "Type “Misc” is not recognised" },
];
const fields = { externalId: "ID", typeColumn: "Type", customer: "Customer", payee: "Supplier", amount: "Amount", dueDate: "Due", number: "ID", label: "Type" };
const html = () => renderToStaticMarkup(createElement(ImportSelector, { headers, rows, labels, fields, customers: [{ id: customerId, name: "Fallback Co" }] }));
function form(entries: [string, string][]) { const data = new FormData(); for (const [key, value] of entries) data.append(key, value); return data; }
const base: [string, string][] = [
  ...Object.entries(fields), ["customerId", customerId], ...headers.map(h => ["column", h] as [string, string]),
  ...labels.map(l => ["rowId", l.externalId] as [string, string]), ["row", "SRC-1"], ["row", "SRC-2"], ["row", "SRC-3"],
];

describe("import selector", () => {
  it("shows Select all, every column and row checkbox with accessible names", () => {
    const page = html();
    expect(page).toContain("Select all");
    for (const header of headers) expect(page).toContain(`aria-label="Include column ${header}"`);
    expect(page).toContain('aria-label="Include row SRC-1"');
    expect(page).toContain('aria-label="Label for row SRC-4"');
  });
  it("shows payment rows as Collections work and reasons for every label", () => {
    const page = html();
    expect(page).toContain("Payment — record it in Collections");
    expect(page).toContain("Type “Misc” is not recognised");
  });
  it("unticking a column removes it from columns and an unticked row becomes excluded", () => {
    const mapping = readSelectorForm(form(base.filter(([k, v]) => !(k === "column" && v === "Type") && !(k === "typeColumn"))), labels);
    expect(mapping.columns).not.toContain("Type");
    expect(mapping.excludedIds).toEqual(["SRC-4"]);
  });
  it("payment rows have no checkbox and are never counted as left out", () => {
    const mapping = readSelectorForm(form([...base.filter(([k, v]) => !(k === "row" && v === "SRC-3")), ["row", "SRC-4"]]), labels);
    expect(mapping.excludedIds).toEqual([]);
  });
  it("changing a label records an override only when it differs from the reader", () => {
    const mapping = readSelectorForm(form([...base, ["label:SRC-1", "invoice"], ["label:SRC-2", "invoice"]]), labels);
    expect(mapping.overrides).toEqual({ "SRC-2": "invoice" });
  });
  it("ticked choose rows block saving", () => {
    expect(selectorProblems(form([...base, ["row", "SRC-4"]]), labels)).toContain("Pick Invoice or Expense for 1 row, or untick it.");
    expect(selectorProblems(form([...base, ["row", "SRC-4"], ["label:SRC-4", "expense"]]), labels)).toEqual([]);
  });
  it("a missing ID column blocks saving with the reason", () => {
    expect(selectorProblems(form(base.filter(([k]) => k !== "externalId")), labels)[0])
      .toBe("Pick the column that names each row, like an invoice or reference number. It stops an edited row from being added twice.");
  });
  it("keeps saved left-out rows and label changes for rows not shown", () => {
    const saved = { excludedIds: ["SRC-1", "SRC-200"], overrides: { "SRC-300": "expense" as const, "SRC-2": "invoice" as const } };
    const mapping = readSelectorForm(form([...base.filter(([k, v]) => !(k === "row" && v === "SRC-1"))]), labels, saved);
    expect(mapping.excludedIds.sort()).toEqual(["SRC-1", "SRC-200", "SRC-4"]);
    expect(mapping.overrides).toEqual({ "SRC-300": "expense" });
  });
  it("shows saved choices when the setup is reopened", () => {
    const page = renderToStaticMarkup(createElement(ImportSelector, { headers, rows, labels, fields, customers: [], saved: { excludedIds: ["SRC-2"], columns: headers.filter(h => h !== "Supplier"), overrides: {} } }));
    const input = (label: string) => page.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
    expect(input("Include row SRC-2")).not.toContain("checked");
    expect(input("Include row SRC-1")).toContain("checked");
    expect(input("Include column Supplier")).not.toContain("checked");
    expect(input("Include column ID")).toContain("checked");
  });
  it("relabels rows when the owner changes the column choices", () => {
    const changed = form([...base.filter(([k]) => k !== "typeColumn" && k !== "label"), ["label", "ID"]]);
    const result = relabel(headers, rows, changed);
    expect(result.map(item => [item.externalId, item.label])).toEqual([["SRC-1", "invoice"], ["SRC-2", "expense"], ["SRC-3", "choose"], ["SRC-4", "choose"]]);
  });
});
