import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordHistory } from "@/components/record-history";
import type { AuditEvent } from "@/lib/server/workspace";

function render(change: AuditEvent["change"], reason: string | null = null) {
  const event: AuditEvent = {
    id: "1",
    business_id: "business",
    actor_id: "owner",
    entity_kind: "invoice",
    entity_id: "invoice",
    created_at: "2026-10-27T12:00:00Z",
    change,
    reason,
  };
  return renderToStaticMarkup(
    createElement(RecordHistory, {
      invoiceId: "invoice",
      events: [event],
      members: [{ user_id: "owner", display_name: "Owner", role: "owner" }],
      cursor: "older",
      nextCursor: "2026-10-27T12:00:00+00|1",
    }),
  );
}
describe("readable invoice history", () => {
  it("retains a promise's dates, amount and escaped customer source", () => {
    const html = render({
      operation: "confirm_expectation",
      before: { remaining_cents: 5000000, expected_date: "2026-10-29" },
      after: {
        remaining_cents: 3000000,
        expected_date: "2026-11-02",
        kind: "commitment",
        source_note: "30k Monday <script> then 20k Friday",
      },
    });
    expect(html).toContain("₱30,000.00");
    expect(html).toContain("Expected payment set");
    expect(html).toContain("2 Nov 2026");
    expect(html).toContain("Customer promise");
    expect(html).toContain("Not counted as cash until the payment is recorded.");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Older changes");
    expect(html).toContain("Latest changes");
  });
  it("explains a receipt void and links to its retained payment", () => {
    const html = render(
      {
        movementId: "old-payment",
        before: { paid_cents: 2000000, outstanding_cents: 3000000 },
        after: { paid_cents: 0, outstanding_cents: 5000000 },
      },
      "Duplicate bank entry corrected.",
    );
    expect(html).toContain("Payment voided");
    expect(html).toContain("₱20,000.00 added back to what");
    expect(html).toContain("?movement=old-payment#payment-history");
    expect(html).toContain("Duplicate bank entry corrected.");
  });
  it("retains completion outcomes and the next action link", () => {
    const html = render({
      operation: "complete_followup",
      after: {
        next_action: "Call customer",
        due_date: "2026-10-29",
        assignee_id: "owner",
        outcome: "Customer requested a bank check.",
        next_date: "2026-10-30",
      },
      nextFollowupId: "next-task",
    });
    expect(html).toContain("Customer requested a bank check.");
    expect(html).toContain("Follow-up done");
    expect(html).toContain("Next step on 30 Oct 2026");
    expect(html).toContain("#followup-next-task");
  });
  it("names an invoice edit by what changed", () => {
    const html = render({ before: { amount_cents: 5000000, due_date: "2026-10-31" }, after: { amount_cents: 4500000, due_date: "2026-10-31" } }, "Agreed discount");
    expect(html).toContain("Invoice details changed");
    expect(html).toContain("Total ₱50,000.00 → ₱45,000.00");
    expect(html).not.toContain("Due 31 Oct 2026 →");
    expect(html).toContain("Agreed discount");
  });
});
