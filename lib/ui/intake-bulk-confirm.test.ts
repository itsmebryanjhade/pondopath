import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ confirmSelectedIntakeAction: vi.fn() }));
import { IntakeBulkConfirm, IntakeBulkResult } from "@/components/intake-bulk-confirm";
import type { IntakeItem } from "@/lib/server/intake";
const invoice = { type: "save_invoice", payload: { number: "Fictional", customerId: "30000000-0000-4000-8000-000000000001", amountCents: 12500, dueDate: "2026-11-10" } };
const item = (suffix: string, status = "pending", candidate = invoice): IntakeItem => ({
  id: "10000000-0000-4000-8000-" + suffix.padStart(12, "0"), business_id: "20000000-0000-4000-8000-000000000001", source_id: "20000000-0000-4000-8000-000000000002", external_id: "ROW-" + suffix, source_version: "1",
  candidate, original_content: candidate, current_values: null, matched_record_id: null, matched_version: null, status, review_version: 1, observed_at: "2026-11-07T00:00:00Z", staged_by: "20000000-0000-4000-8000-000000000003",
  reviewed_by: null, reviewed_at: null, review_note: null, outcome: null, source_evidence: {},
});
describe("Review Inbox bulk selection", () => {
  it("offers labelled checkboxes only for pending, parseable items", () => {
    const html = renderToStaticMarkup(createElement(IntakeBulkConfirm, { items: [item("1"), item("2", "needs_match"), item("3", "applied"), item("4", "pending", {} as typeof invoice)], revision: 0 }));
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    // The wrapping label names each checkbox with the full row description.
    expect(html).toMatch(/<label[^>]*><input type="checkbox"[^>]*\/>Invoice Fictional[^<]*Source row ROW-1/);
    for (const suffix of ["2", "3", "4"]) expect(html).not.toContain("Source row ROW-" + suffix + " ·");
    expect(html).toContain("Select all clean");
  });
  it("describes each row with its number, amount, due date and file so repeated source IDs can be told apart", () => {
    const html = renderToStaticMarkup(createElement(IntakeBulkConfirm, { items: [item("1")], revision: 0, sourceLabels: { "20000000-0000-4000-8000-000000000002": "Fictional ledger" } }));
    for (const text of ["Fictional", "125.00", "due 2026-11-10", "Source row ROW-1", "Fictional ledger"]) expect(html).toContain(text);
  });
  it("disables confirmation when nothing is selected", () => {
    const html = renderToStaticMarkup(createElement(IntakeBulkConfirm, { items: [item("1")], revision: 0 }));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirm selected \(0\)<\/button>/);
  });
  it("announces confirmed and failed counts with plain failure messages", () => {
    const values = [item("1"), item("2"), item("3"), item("4")];
    const result = { confirmed: [values[0].id, values[1].id], failed: [{ id: values[2].id, code: "STALE_VERSION" }, { id: values[3].id, code: "FORBIDDEN" }], revision: 2 };
    const html = renderToStaticMarkup(createElement(IntakeBulkResult, { result, items: values }));
    expect(html).toContain('role="status"');
    expect(html).toContain("2 confirmed, 2 need attention");
    expect(html).toContain("Changed since you opened the inbox — refresh and review it");
    expect(html).toContain("Needs review on its own");
    expect(html).toContain("ROW-3");
    expect(html).not.toContain("STALE_VERSION");
  });
});
