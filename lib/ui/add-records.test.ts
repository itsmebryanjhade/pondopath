import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ ensureFileSourceAction: vi.fn(), inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn() }));
import { AddRecords, canSend, countSelection, describeFailure, missingChoices, needsAttention } from "@/components/add-records";

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
});
