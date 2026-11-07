import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CashPosition } from "@/components/cash-position";
import type { getCashMovements } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const openingControls = createElement("button", null, "Set opening cash");

function movement(index: number): Awaited<ReturnType<typeof getCashMovements>>[number] {
  const workspace = uiWorkspace();
  return {
    id: `movement-${index}`, business_id: workspace.business.id,
    amount_cents: 100_000, kind: "receipt", invoice_id: workspace.invoices[0].id,
    expense_id: null, payment_date: "2026-10-29", created_at: `2026-10-29T0${index}:00:00Z`,
    effects: {}, recorded_by: workspace.actor.userId, reference: `Receipt ${index}`,
    request_id: `request-${index}`, voided_at: null, voided_by: null, void_reason: null,
  };
}

describe("Cash page source layout with saved balances", () => {
  it("uses complete snapshot totals rather than the limited movement preview or promises", () => {
    const workspace = uiWorkspace();
    workspace.invoices[0].paid_cents = 2_000_000;
    workspace.expenses[0].paid_cents = 500_000;
    workspace.forecastInput.availableCents = 5_500_000;
    const html = renderToStaticMarkup(CashPosition({ workspace, receipts: [movement(1)], payments: [], openingControls }));
    expect(html).toContain('class="section-feature"');
    // The three metric cards were removed; their figures appear once, in the cash strip.
    expect(html).not.toContain('class="section-metric"');
    expect(html).toContain("₱55,000.00");
    expect(html).toContain("₱20,000.00");
    expect(html).toContain("₱5,000.00");
    expect(html).toContain("Customer promises don’t count until they’re paid");
    // Payment history now sits on this page beside the balance; no button sends people to another page.
    expect(html).toContain('id="payment-history"');
    expect(html).toContain("Payment history");
    expect(html).not.toContain('href="/payments"');
    expect(html).not.toContain("Bank balances");
    expect(html).toContain("Set opening cash");
    // Opening cash + received − paid out = available now, shown as one strip.
    const math = html.slice(html.indexOf("How your available cash is worked out"));
    expect([...math.matchAll(/<strong class="num[^"]*">(₱[\d,.]+)<\/strong>/g)].slice(0, 4).map((m) => m[1])).toEqual(["₱40,000.00", "₱20,000.00", "₱5,000.00", "₱55,000.00"]);
  });

  it("lists every retained entry newest first, with a void kept visible and linked to its record", () => {
    const receipts = Array.from({ length: 6 }, (_, i) => movement(i));
    receipts[5].voided_at = "2026-10-29T06:00:00Z";
    receipts[5].void_reason = "Duplicate entry";
    const html = renderToStaticMarkup(CashPosition({ workspace: uiWorkspace(), receipts, payments: [], openingControls }));
    expect(html.match(/class="history-row/g)).toHaveLength(6);
    expect(html.indexOf("Receipt 5")).toBeLessThan(html.indexOf("Receipt 4"));
    expect(html).toContain("Ref Receipt 0");
    // Rows lead with the customer, not the reference.
    expect(html).toContain("<strong>Demo customer</strong>");
    expect(html).toContain("Voided: Duplicate entry");
    expect(html).toContain("?movement=movement-5#movement-movement-5");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("+₱1,000.00");
    expect(html).not.toContain("Latest 5 entries");
  });

  it("keeps the baseline locked and owner-only, and handles empty and negative balances", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance";
    workspace.forecastInput.availableCents = -100_000;
    let html = renderToStaticMarkup(CashPosition({ workspace, receipts: [], payments: [], openingControls }));
    expect(html).toContain("Only the owner can change opening cash");
    expect(html).not.toContain("Set opening cash");
    expect(html).toContain("No payments recorded yet");
    expect(html).toContain("Record money received");
    expect(html).toContain("-₱1,000.00");
    workspace.actor.role = "owner";
    workspace.business.opening_locked_at = "2026-10-29T01:00:00Z";
    html = renderToStaticMarkup(CashPosition({ workspace, receipts: [], payments: [], openingControls }));
    expect(html).toContain("Locked because a payment has been recorded");
    expect(html).toContain('href="#payment-history"');
    expect(html).not.toContain("Set opening cash");
  });
});
