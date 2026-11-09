import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));
import { InvoicePayments } from "@/components/invoice-payments";
import type { getCashMovements } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

type Movement = Awaited<ReturnType<typeof getCashMovements>>[number];
function receipt(workspace: ReturnType<typeof uiWorkspace>, id: string, extra: Partial<Movement> = {}): Movement {
  return {
    id, business_id: workspace.business.id, kind: "receipt", invoice_id: workspace.invoices[0].id, expense_id: null,
    amount_cents: 1_000_000, payment_date: "2026-10-30", reference: "OR-12", recorded_by: workspace.actor.userId,
    effects: {}, request_id: `req-${id}`, created_at: "2026-10-30T03:00:00Z", voided_at: null, voided_by: null, void_reason: null,
    ...extra,
  };
}

describe("Payments received on an invoice", () => {
  it("points to Record payment when nothing has come in yet", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(InvoicePayments({ workspace, movements: [] }));
    expect(html).toContain('id="payment-history"');
    expect(html).toContain("No payments yet.");
    expect(html).not.toContain("Showing");
  });

  it("leads with date and amount, totals only counted payments, and keeps voided ones crossed out", () => {
    const workspace = uiWorkspace();
    const movements = [
      receipt(workspace, "p1"),
      receipt(workspace, "p2", { amount_cents: 500_000, created_at: "2026-10-31T03:00:00Z", voided_at: "2026-11-01T00:00:00Z", void_reason: "Bounced cheque" }),
    ];
    const html = renderToStaticMarkup(InvoicePayments({ workspace, movements }));
    expect(html).toContain('id="movement-p1" tabindex="-1"');
    expect(html).toContain("in 1 payment");
    expect(html).toContain("30 Oct 2026");
    expect(html).toContain("Ref OR-12 · Recorded by you");
    expect(html).toContain("Voided: Bounced cheque");
    expect(html).toMatch(/class="is-voided"/);
    expect((html.match(/>Delete this payment</g) ?? []).length).toBe(1);
  });

  it("tells a teammate to ask the owner instead of showing void controls", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance" as typeof workspace.actor.role;
    const html = renderToStaticMarkup(InvoicePayments({ workspace, movements: [receipt(workspace, "p1")] }));
    expect(html).not.toContain("Delete this payment");
    expect(html).toContain("Ask the owner to void it.");
  });
});
