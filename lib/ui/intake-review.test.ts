import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { IntakeReview } from "@/components/intake-review";
import { CsvImport } from "@/components/csv-import";
import type { IntakeItem } from "@/lib/server/intake";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ reviewIntakeAction: vi.fn(), inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn(), createCsvSourceAction: vi.fn() }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

it("shows the actual saved record for a newly applied proposal and keeps its source evidence", () => {
  const workspace = uiWorkspace();
  const invoice = workspace.invoices[0];
  const item: IntakeItem = {
    id: "00000000-0000-4000-8000-000000000001", business_id: workspace.business.id,
    source_id: "00000000-0000-4000-8000-000000000002", external_id: "0001", source_version: "content-1",
    candidate: { type: "save_invoice", payload: { number: invoice.number, customerId: "00000000-0000-4000-8000-000000000003", amountCents: invoice.amount_cents, dueDate: invoice.due_date } },
    original_content: {}, current_values: null, matched_record_id: null, matched_version: null, status: "applied", review_version: 1,
    observed_at: "2026-11-02T00:00:00Z", staged_by: workspace.actor.userId, reviewed_by: workspace.actor.userId,
    reviewed_at: "2026-11-02T00:01:00Z", review_note: null, outcome: { recordId: invoice.id, revision: 1, replayed: false }, source_evidence: { filename: "fictional.csv", row: 2 },
  };
  const html = renderToStaticMarkup(createElement(IntakeReview, { item, sourceLabel: "Fictional CSV", workspace }));
  expect(html).toContain(`Record version ${invoice.version}`);
  expect(html).not.toContain("No saved record has been changed");
  expect(html).toContain("fictional.csv");
  expect(html).toContain(`/invoices/${invoice.id}`);
  expect(html).not.toContain("Confirm and apply");
});

it("lets finance reuse CSV and XLSX sources and choose either supported file format", () => {
  const html = renderToStaticMarkup(createElement(CsvImport, {
    sources: [
      { id: "00000000-0000-4000-8000-000000000001", kind: "manual_csv", label: "Existing CSV source" },
      { id: "00000000-0000-4000-8000-000000000002", kind: "manual_xlsx", label: "Workbook source" },
    ], customers: uiWorkspace().customers, owner: false,
  }));
  expect(html).toContain("Existing CSV source");
  expect(html).toContain("Workbook source");
  expect(html).toMatch(/accept="[^"]*\.csv[^"]*\.xlsx/);
  expect(html).not.toContain("Create source");
});

it("offers Mixed (by Type column) with value lists and both record field sets", async () => {
  const { ImportMappingFields } = await import("@/components/csv-import");
  const props = { headers: ["ID", "Type", "Status"], customers: [{ id: "00000000-0000-4000-8000-000000000003", name: "Fictional Customer" }], onKindChange: () => {} };
  expect(renderToStaticMarkup(createElement(ImportMappingFields, { ...props, kind: "invoice" }))).toContain("Mixed (by Type column)");
  const mixed = renderToStaticMarkup(createElement(ImportMappingFields, { ...props, kind: "mixed" }));
  for (const label of ["Type column", "Values meaning invoice", "Values meaning expense", "Invoice number", "Expense label", "Payee / supplier"]) expect(mixed).toContain(label);
});

it("offers an optional row filter and builds the mapping from the form", async () => {
  const { ImportMappingFields, readMappingForm } = await import("@/components/csv-import");
  const html = renderToStaticMarkup(createElement(ImportMappingFields, { headers: ["ID", "Status"], customers: [], kind: "expense", onKindChange: () => {} }));
  expect(html).toContain("Only include rows where");
  expect(html).toContain("equals");
  const data = new FormData();
  for (const [key, value] of Object.entries({ externalId: "ID", amount: "Amount", dueDate: "Due", typeColumn: "Type", invoiceValues: "Invoice, AR", expenseValues: "Bill", number: "No", customerId: "00000000-0000-4000-8000-000000000003", label: "Label", payee: "Payee", filterColumn: "Status", filterValue: "Unpaid" })) data.set(key, value);
  expect(readMappingForm(data, "mixed")).toMatchObject({ kind: "mixed", invoiceValues: ["Invoice", "AR"], expenseValues: ["Bill"], filter: { column: "Status", value: "Unpaid" } });
  data.delete("filterColumn");
  expect(readMappingForm(data, "mixed")).not.toHaveProperty("filter");
});
