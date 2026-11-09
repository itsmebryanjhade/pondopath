import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ ensureFileSourceAction: vi.fn(), inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn() }));
import { AddRecords, canSend, countSelection, describeFailure, missingChoices, needsAttention } from "@/components/add-records";
import { sheetToRead, summarizeWorkbookRows } from "@/lib/domain/add-records";
import { CheckSummary, WorkbookSheetPicker } from "@/components/add-records-parts";
import { ImportSelector, readSelectorForm } from "@/components/import-selector";

const BANNED = /KiB|UTF|row ID|YYYY|source/i;
const visibleText = (markup: string) => markup.replace(/<[^>]+>/g, " ");

describe("Add records flow", () => {
  it("starts on the File step with the three choices", () => {
    const markup = renderToStaticMarkup(createElement(AddRecords, { customers: [], googleSlot: createElement("p", null, "google panel") })).replaceAll("&#x27;", "'");
    expect(markup).toMatch(/aria-current="step"[^>]*>[\s\S]*?File/);
    for (const text of ["Drop your Excel or CSV file here", "Connect Google Sheet", "Type it in"]) expect(markup).toContain(text);
    expect(markup).not.toContain("google panel");
    expect(visibleText(markup)).not.toMatch(BANNED);
  });
  it("passes the owner message through and makes other failures plain", () => {
    expect(describeFailure("Ask the owner to add the first file.")).toBe("Ask the owner to add the first file.");
    expect(describeFailure("Choose a .csv or .xlsx file up to 512 KiB.")).toBe("That file is empty, too big, or not Excel or CSV. Choose an Excel or CSV file with fewer rows.");
    expect(describeFailure("weird")).toMatch(/couldn't read that file/);
  });
  it("Send is disabled while busy and for zero rows", () => {
    expect(canSend({ busy: false, rows: 3 })).toBe(true);
    expect(canSend({ busy: true, rows: 3 })).toBe(false);
    expect(canSend({ busy: false, rows: 0 })).toBe(false);
  });
  it("opens the check panel whenever a column the server needs is missing, or a customer must be picked", () => {
    const all = { externalId: "Ref", amount: "Amount", dueDate: "Due", number: "Invoice no", label: "Description", payee: "Supplier" };
    const labels = [{ row: 2, externalId: "A", label: "invoice" as const, reason: "" }];
    expect(needsAttention({ fields: all, labels, customers: 1 })).toBe(false);
    for (const missing of ["externalId", "amount", "dueDate", "number", "label", "payee"] as const) {
      const fields: Record<string, string> = { ...all };
      delete fields[missing];
      expect(needsAttention({ fields, labels, customers: 1 })).toBe(true);
    }
    expect(needsAttention({ fields: all, labels: [{ ...labels[0], label: "choose" as const }], customers: 1 })).toBe(true);
    expect(needsAttention({ fields: all, labels, customers: 2 })).toBe(true);
    expect(needsAttention({ fields: all, labels: [{ ...labels[0], label: "expense" as const }], customers: 0 })).toBe(true);
  });
  it("missingChoices names every empty column or customer in plain words", () => {
    const form = new FormData();
    for (const [key, value] of [["externalId", "Ref"], ["amount", "Amount"], ["dueDate", ""], ["number", "No"], ["label", ""], ["payee", "Supplier"], ["customerId", ""]]) form.set(key, value);
    expect(missingChoices(form)).toEqual(["Due date", "Description", "Customer for invoices without one"]);
  });
  it("countSelection follows ticks and the person's own Invoice/Expense choices", () => {
    const labels = [
      { row: 2, externalId: "A", label: "choose" as const, reason: "" },
      { row: 3, externalId: "B", label: "invoice" as const, reason: "" },
      { row: 4, externalId: "C", label: "expense" as const, reason: "" },
      { row: 5, externalId: "D", label: "payment" as const, reason: "" },
    ];
    const form = new FormData();
    for (const id of ["A", "B"]) form.append("row", id);
    form.set("label:A", "expense"); form.set("label:B", "invoice"); form.set("label:C", "expense");
    expect(countSelection(form, labels)).toEqual({ invoice: 1, expense: 1 });
    form.set("label:A", "");
    expect(countSelection(form, labels)).toEqual({ invoice: 1, expense: 0 });
  });

  it("prefers the first worksheet when an Excel workbook opens without a selected sheet", () => {
    expect(sheetToRead("xlsx", null, ["Invoices", "Bills"])).toBe("Invoices");
    expect(sheetToRead("xlsx", "Bills", ["Invoices", "Bills"])).toBeNull();
    expect(sheetToRead("csv", null, ["Invoices", "Bills"])).toBeNull();
  });

  it("shows per-sheet ready totals, excluded open balance, and source-row exceptions", () => {
    const groups = summarizeWorkbookRows([
      { sheet: "Invoices", row: 8, externalId: "INV-1", status: "balance_review", message: "Review the partly paid invoice.", openCents: 3000000 },
      { sheet: "Bills", row: 4, externalId: "BILL-1", status: "new", message: "Review before applying.", candidate: { type: "save_expense", payload: { label: "Stock", payee: "Northwind", amountCents: 85000, dueDate: "2026-11-18" } } },
    ]).groups;
    const markup = renderToStaticMarkup(createElement(CheckSummary, { summary: "1 bill ready", held: "", headers: ["Name", "Amount"], rows: [], groups })).replaceAll("&#x27;", "'");
    expect(markup).toContain("Invoices");
    expect(markup).toContain("Bills");
    expect(markup).toContain("₱30,000.00");
    expect(markup).toContain("INV-1");
    expect(markup).toContain("row 8");
    expect(markup).toContain("₱850.00");
  });

  it("offers one accessible selection for all relevant workbook sheets", () => {
    const markup = renderToStaticMarkup(createElement(WorkbookSheetPicker, {
      sheets: ["Invoices", "Bills"], selected: ["Invoices", "Bills"], disabled: false, onToggle: () => {}, onRead: () => {},
    }));
    expect(markup).toContain("Sheets to include");
    expect(markup).toContain('aria-label="Include Invoices worksheet"');
    expect(markup).toContain('aria-label="Include Bills worksheet"');
    expect(markup).toContain("Preview selected sheets");
  });

  it("keeps paid, open-balance, and status columns in the confirmed mapping", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ externalId: "ID", amount: "Amount", dueDate: "Due", number: "Invoice", customerId: "00000000-0000-4000-8000-000000000001", label: "Description", payee: "Supplier", paidAmount: "Paid", openBalance: "Open Balance", status: "Status" })) form.set(key, value);
    for (const column of ["ID", "Amount", "Due", "Invoice", "Description", "Supplier", "Paid", "Open Balance", "Status"]) form.append("column", column);
    expect(readSelectorForm(form, [])).toMatchObject({ paidAmount: "Paid", openBalance: "Open Balance", status: "Status" });
  });
  it("shows explicit mapping help without making a provider request on render", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const markup = renderToStaticMarkup(createElement(ImportSelector, {
        headers: ["Reference", "Amount", "Due"], rows: [["<text>", "<text>", "<text>"]], labels: [], fields: {}, customers: [],
        onHelpMatchColumns: async () => { await fetch("/api/assistant"); return undefined; },
      }));
      expect(markup).toContain("Help match columns");
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
