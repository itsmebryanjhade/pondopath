import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { IntakeReview } from "@/components/intake-review";
import type { IntakeItem } from "@/lib/server/intake";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ reviewIntakeAction: vi.fn() }));
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
