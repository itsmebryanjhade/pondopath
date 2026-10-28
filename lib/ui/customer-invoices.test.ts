import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerInvoices } from "@/components/customer-invoices";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function fixture() {
  const workspace = uiWorkspace();
  workspace.expectations = workspace.forecastInput.invoices.map((invoice) => ({
    id: invoice.expectation!.id, invoice_id: invoice.id, business_id: workspace.business.id,
    amount_cents: invoice.expectation!.remainingCents, remaining_cents: invoice.expectation!.remainingCents,
    expected_date: invoice.expectation!.date, kind: invoice.expectation!.kind, state: "active",
    confirmed_at: "2026-10-29T00:00:00Z", confirmed_by: workspace.actor.userId,
    source_note: "Fictional customer reply", version: 1,
  }));
  return workspace;
}

function render(workspace = fixture(), params: { page?: string; filter?: string } = {}) {
  return renderToStaticMarkup(CustomerInvoices({ workspace, params,
    invoiceControls: createElement("button", null, "Add invoice"),
    customerControls: createElement("button", null, "Save customer"),
  }));
}

function chartAmounts(html: string) {
  return [...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]));
}

describe("source Invoices page connected to collection records", () => {
  it("preserves partial commitments, original dates and source links in the new layout", () => {
    const workspace = fixture();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    workspace.expectations[0].remaining_cents = 3_000_000;
    const html = render(workspace);
    expect(html).toContain("section-invoices invoices-page");
    expect(html.match(/class="section-metric"/g)).toHaveLength(3);
    expect(chartAmounts(html)).toEqual([3_000_000, 0, 0, 0, 0]);
    expect(html).toContain("₱50,000.00");
    expect(html).toContain("₱20,000.00");
    expect(html).toContain("unplanned");
    expect(html).toContain("2026-10-28");
    expect(html).toContain("Customer commitment");
    expect(html).toContain(`#collection-plan`);
    expect(html).toContain("Expected receipts are not available cash");
    expect(html).toContain("Add invoice");
    expect(html).toContain("Save customer");
  });

  it("uses the forecast rules to exclude stale, review-needed, paid and out-of-window amounts", () => {
    const workspace = fixture();
    const base = workspace.invoices[0];
    const plan = workspace.forecastInput.invoices[0];
    workspace.invoices = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `invoice-${i}`, number: `INV-${i}`, outstanding_cents: i === 4 ? 0 : base.outstanding_cents }));
    workspace.forecastInput.invoices = workspace.invoices.map((invoice, i) => ({
      ...plan, id: invoice.id, outstandingCents: invoice.outstanding_cents,
      expectation: { ...plan.expectation!, id: `expectation-${i}`, remainingCents: i === 4 ? 0 : 5_000_000, needsReview: i === 1, date: i === 2 ? "2026-10-28" : i === 3 ? "2026-11-28" : "2026-11-27" },
    }));
    workspace.expectations = [];
    const html = render(workspace);
    expect(chartAmounts(html)).toEqual([0, 0, 0, 0, 5_000_000]);
    expect(html).toContain("Fully received");
    expect(html).not.toContain("NaN");
  });

  it("retains collection filtering and stable 50-row pagination without filtering headline totals", () => {
    const workspace = fixture();
    const base = workspace.invoices[0];
    workspace.invoices = Array.from({ length: 51 }, (_, i) => ({ ...base, id: `invoice-${String(i).padStart(2, "0")}`, number: `INV-${String(i).padStart(2, "0")}` }));
    workspace.forecastInput.invoices = workspace.invoices.map((invoice) => ({ id: invoice.id, outstandingCents: invoice.outstanding_cents, expectation: null }));
    workspace.expectations = [];
    let html = render(workspace, { filter: "overdue", page: "2" });
    expect(html).toContain("INV-50");
    expect(html).not.toContain("INV-49");
    expect(html).toContain('/invoices?filter=overdue&amp;page=1');
    expect(html).toContain("₱2,550,000.00");
    html = render(workspace, { filter: "due" });
    expect(html).toContain("No invoices match this collection view");
    expect(html).toContain("₱2,550,000.00");
    html = render(workspace, { filter: "__proto__", page: "9999" });
    expect(html).toContain("INV-50");
    expect(html).toContain('/invoices?filter=all&amp;page=1');
  });

  it("uses original due dates for the inclusive seven-day summary", () => {
    const workspace = fixture();
    const base = workspace.invoices[0];
    workspace.invoices = ["2026-10-28", "2026-10-29", "2026-11-04", "2026-11-05"]
      .map((due_date, i) => ({ ...base, id: `invoice-${i}`, due_date }));
    workspace.forecastInput.invoices = workspace.invoices.map((invoice) => ({ id: invoice.id, outstandingCents: invoice.outstanding_cents, expectation: null }));
    workspace.expectations = [];
    const html = render(workspace);
    expect(html).toMatch(/Due in the next 7 days<\/p><strong[^>]*>₱100,000.00/);
    expect(html).toMatch(/Overdue balance<\/p><strong[^>]*>₱50,000.00/);
  });

  it("shows a useful empty state and still allows adding the first customer", () => {
    const workspace = fixture();
    workspace.invoices = [];
    workspace.forecastInput.invoices = [];
    workspace.expectations = [];
    workspace.customers = [];
    const html = render(workspace);
    expect(html).toContain("No invoices yet");
    expect(html).toContain("Create a customer first");
    expect(html).not.toContain(">Add invoice<");
    expect(html).toContain("Save customer");
    expect(chartAmounts(html)).toEqual([0, 0, 0, 0, 0]);
  });
});
