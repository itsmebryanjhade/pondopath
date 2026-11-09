import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CashMovements } from "@/components/cash-movements";
import type { getCashMovements } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

function paymentHistory() {
  const workspace = uiWorkspace();
  const movement: Awaited<ReturnType<typeof getCashMovements>>[number] = {
    id: "demo-bill-payment", business_id: workspace.business.id, kind: "expense_payment",
    invoice_id: null, expense_id: workspace.expenses[0].id, amount_cents: 500_000,
    payment_date: "2026-10-30", reference: "DEMO-01", recorded_by: workspace.actor.userId,
    effects: {}, request_id: "demo-payment-request",
    created_at: "2026-10-30T03:00:00Z", voided_at: null, voided_by: null, void_reason: null,
  };
  return { workspace, movement };
}

describe("payment history corrections", () => {
  it("shows a bill-specific confirmation with a required reason and review", () => {
    const { workspace, movement } = paymentHistory();
    const html = renderToStaticMarkup(CashMovements({ workspace, movements: [movement], kind: "expense_payment" }));
    expect(html).toContain('id="movement-demo-bill-payment" tabindex="-1"');
    expect(html).toContain('name="bill-payment-corrections"');
    expect(html).toContain("Reason for voiding");
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="reason"/);
    expect(html).toContain('<input type="checkbox" required=""/>');
    expect(html).toContain("Confirm void");
    expect(html).not.toContain("customer receipt");
  });

  it("keeps the receipt-specific explanation and reserves correction for owners", () => {
    const { workspace, movement } = paymentHistory();
    const receipt = { ...movement, kind: "receipt" as const, invoice_id: workspace.invoices[0].id, expense_id: null };
    let html = renderToStaticMarkup(CashMovements({ workspace, movements: [receipt], selected: true }));
    expect(html).toContain("Any expected payment goes back for review.");
    expect(html).toContain("Confirm void");
    workspace.actor.role = "finance";
    html = renderToStaticMarkup(CashMovements({ workspace, movements: [movement], kind: "expense_payment" }));
    expect(html).toContain("Only the owner can void an incorrect entry.");
    expect(html).not.toContain('name="reason"');
  });
});
