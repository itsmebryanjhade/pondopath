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
  expect(html).toContain("What was imported");
  expect(html).not.toContain("Saved now");
  expect(html).toContain("Applied on 2 Nov 2026");
  expect(html).not.toContain("Record version");
  expect(html).not.toContain("No saved record has been changed");
  expect(html).toContain("fictional.csv");
  expect(html).toContain(`href="/invoices/${invoice.id}?from=review"`);
  expect(html).not.toContain("Confirm and apply");
});

function pendingItem(workspace: ReturnType<typeof uiWorkspace>, extra: Partial<IntakeItem> = {}): IntakeItem {
  return {
    id: "00000000-0000-4000-8000-000000000011", business_id: workspace.business.id,
    source_id: "00000000-0000-4000-8000-000000000002", external_id: "0002", source_version: "content-1",
    candidate: { type: "save_invoice", payload: { number: "NEW-7", customerId: workspace.customers[0].id, amountCents: 1_250_000, dueDate: "2026-11-20" } },
    original_content: {}, current_values: null, matched_record_id: null, matched_version: null, status: "pending", review_version: 1,
    observed_at: "2026-11-02T00:00:00Z", staged_by: workspace.actor.userId, reviewed_by: null,
    reviewed_at: null, review_note: null, outcome: null, source_evidence: null, ...extra,
  };
}

it("gives a pending proposal one main Confirm action and keeps the other choices quiet", () => {
  const workspace = uiWorkspace();
  const html = renderToStaticMarkup(createElement(IntakeReview, { item: pendingItem(workspace), sourceLabel: "Fictional CSV", workspace }));
  expect(html).toMatch(/class="row-action is-main"[^>]*>Confirm</);
  for (const label of ["Edit", "Ask a question", "Reject"]) expect(html).toMatch(new RegExp(`class="row-action is-quiet"[^>]*>${label}<`));
  expect(html).toContain("This adds a new invoice, NEW-7, for ₱12,500.00, due 20 Nov 2026.");
  expect(html).toContain("Waiting for you");
  expect(html).toContain("New invoice. Nothing is saved until you confirm.");
  expect(html).toMatch(/<input(?=[^>]*name="confirmed")(?=[^>]*type="checkbox")(?=[^>]*required="")[^>]*>/);
  // A note is required for every choice except applying.
  expect((html.match(/<textarea[^>]*name="note"[^>]*required=""|<textarea[^>]*required=""[^>]*name="note"/g) ?? []).length).toBe(3);
  expect(html).not.toContain("Confirm and apply");
});

it("opens Match or edit first and blocks applying when a proposal needs a match", () => {
  const workspace = uiWorkspace();
  const html = renderToStaticMarkup(createElement(IntakeReview, { item: pendingItem(workspace, { status: "needs_match" }), sourceLabel: "Fictional CSV", workspace }));
  expect(html).toMatch(/aria-expanded="true"[^>]*>Match or edit</);
  expect(html).toContain("Use Edit to choose the matching record and save first.");
  expect(html).not.toContain(">Apply<");
  expect(html).toContain("Possible duplicate");
});

it("highlights only the fields that differ from the saved record", () => {
  const workspace = uiWorkspace();
  const saved = workspace.invoices[0];
  const item = pendingItem(workspace, {
    matched_record_id: saved.id, matched_version: saved.version,
    candidate: { type: "save_invoice", payload: { id: saved.id, number: saved.number, customerId: saved.customer_id, amountCents: saved.amount_cents + 100_000, dueDate: saved.due_date } },
  });
  const html = renderToStaticMarkup(createElement(IntakeReview, { item, sourceLabel: "Fictional CSV", workspace }));
  expect((html.match(/class="is-changed"/g) ?? []).length).toBe(1);
  expect(html).toMatch(/<tr class="is-changed"><th scope="row">Amount<\/th>/);
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
