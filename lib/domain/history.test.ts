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
    expect(html).toContain("2026-11-02");
    expect(html).toContain("actual cash unchanged");
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
    expect(html).toContain("Receipt voided");
    expect(html).toContain("Unpaid balance restored");
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
    expect(html).toContain("Next action date: 2026-10-30");
    expect(html).toContain("#followup-next-task");
  });
});
