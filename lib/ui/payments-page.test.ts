import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PaymentsPage from "@/app/(workspace)/payments/page";
import type { getCashMovements } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({ getWorkspace: vi.fn(), getCashMovements: vi.fn() }));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/payment-form", () => ({ VoidForm: ({ movementId }: { movementId: string }) => createElement("form", { "data-void": movementId }) }));

const workspace = uiWorkspace();
const receipt: Awaited<ReturnType<typeof getCashMovements>>[number] = {
  id: "receipt-1", business_id: workspace.business.id, kind: "receipt", amount_cents: 100_000,
  invoice_id: workspace.invoices[0].id, expense_id: null, created_at: "2026-10-29T01:00:00Z",
  payment_date: "2026-10-29", recorded_by: workspace.actor.userId, request_id: "request-1",
  reference: "DEMO-RECEIPT", effects: {}, voided_at: null, voided_by: null, void_reason: null,
};

async function render(role: "owner" | "finance", receipts = [receipt], totals = [2_000_000, 500_000]) {
  const saved = uiWorkspace();
  saved.actor.role = role;
  saved.invoices[0].paid_cents = totals[0];
  saved.expenses[0].paid_cents = totals[1];
  saved.forecastInput.availableCents = saved.business.opening_cash_cents + totals[0] - totals[1];
  readers.getWorkspace.mockResolvedValue(saved);
  readers.getCashMovements.mockImplementation(async (kind: string) => kind === "receipt" ? receipts : []);
  return renderToStaticMarkup(await PaymentsPage());
}

describe("source Payments layout preserves verified records", () => {
  it("uses complete snapshot totals and keeps the real recording destinations", async () => {
    const html = await render("owner");
    expect(html).toContain("section-payments payments-page");
    expect(html).toContain("₱55,000.00");
    expect(html).toContain("₱20,000.00");
    expect(html).toContain("₱5,000.00");
    expect([...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([2_000_000, 500_000]);
    expect(html).toContain("Verified cash movement");
    expect(html).toContain("Voided entries and expected customer payments are excluded");
    expect(html).toContain('href="/invoices?filter=unpaid"');
    expect(html).toContain('href="/expenses"');
    expect(html).toContain('data-void="receipt-1"');
    expect(html).toContain("Latest 50 entries");
    expect(html).toContain("Customer promises and pending reminders are excluded");
  });
  it("retains void reasons and prevents finance users from seeing correction controls", async () => {
    const html = await render("finance", [receipt, { ...receipt, id: "voided-1", voided_at: "2026-10-29T02:00:00Z", void_reason: "Duplicate receipt" }]);
    expect(html).toContain("Voided: Duplicate receipt");
    expect(html).toContain("Only the owner can void an incorrect entry");
    expect(html).not.toContain("data-void=");
    expect(html).not.toContain("Correct this payment entry");
  });
  it("keeps both empty histories understandable", async () => {
    const html = await render("owner", [], [0, 0]);
    expect(html.match(/No actual payments recorded in this view/g)).toHaveLength(2);
    expect([...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([0, 0]);
    expect(html).not.toContain("NaN");
  });
});
