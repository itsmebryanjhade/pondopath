import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerInvoices } from "@/components/customer-invoices";
import { CollectionPanel } from "@/components/collection-panel";
import { addDays } from "@/lib/domain/dates";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

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
  return renderToStaticMarkup(CustomerInvoices({ workspace, params }));
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
    // The metric cards became the breakdown inside "Money customers owe you".
    expect(html).not.toContain('class="section-metric"');
    expect(html).toContain("Money customers owe you");
    expect(chartAmounts(html)).toEqual([3_000_000, 0, 0, 0, 0]);
    expect(html).toContain("₱50,000.00");
    expect(html).toContain("₱20,000.00");
    expect(html).toContain("₱20,000.00 has no payment date");
    expect(html).toContain("Due 28 Oct");
    expect(html).toContain("Customer promised");
    expect(html).toContain(`/invoices/${workspace.invoices[0].id}?plan=edit#collection-plan`);
    expect(html).toContain("Update expected payment");
    expect(html).toMatch(/<li class="invoice-item[\s\S]*?Update expected payment[\s\S]*?<\/li>/);
    // One main action in the header; Add records and Follow-ups are in the sidebar.
    expect(html).not.toContain("Import &amp; review");
    expect(html).toContain(`#collection-plan`);
    expect(html).toContain("Expected receipts are not available cash");
    // The add forms live on Add records; the header opens the invoice form there.
    expect(html).toContain('href="/add?type=invoice"');
    expect(html).not.toContain('id="new-invoice"');
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
    // The checks card names the first five and counts the rest.
    expect(html).toContain("and 46 more");
    expect(html).toContain('/invoices?filter=overdue&amp;page=1');
    expect(html).toContain("₱2,550,000.00");
    html = render(workspace, { filter: "due" });
    expect(html).toContain("No invoices match this filter");
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
    expect(html).toMatch(/Due in the next 7 days<small>2 invoices<\/small><\/span><strong[^>]*>₱100,000.00/);
    expect(html).toMatch(/Overdue<small>1 invoice<\/small><\/span><strong[^>]*>₱50,000.00/);
    expect(html).toMatch(/Due later<small>1 invoice<\/small><\/span><strong[^>]*>₱50,000.00/);
  });

  it("shows a useful empty state that leads to adding the first invoice", () => {
    const workspace = fixture();
    workspace.invoices = [];
    workspace.forecastInput.invoices = [];
    workspace.expectations = [];
    workspace.customers = [];
    const html = render(workspace);
    expect(html).toContain("No invoices yet");
    expect(html).toContain("Add your first invoice");
    expect(html).toContain('href="/add?type=invoice"');
    expect(chartAmounts(html)).toEqual([0, 0, 0, 0, 0]);
  });

  it("offers a direct setup action for an invoice without an expectation", () => {
    const workspace = fixture();
    workspace.expectations = [];
    const html = render(workspace);
    expect(html).toContain("Set expected payment");
    expect(html).toContain(`/invoices/${workspace.invoices[0].id}?plan=edit#collection-plan`);
  });

  it("opens the payment plan from a direct link while keeping receipt facts separate", () => {
    const workspace = fixture();
    const invoice = workspace.invoices[0];
    const html = renderToStaticMarkup(createElement(CollectionPanel, { workspace, invoice, openPlan: true }));
    expect(html).toMatch(/aria-expanded="true"[^>]*>Set a new date|aria-expanded="true"[^>]*>Update expected payment|aria-expanded="true"[^>]*>Set expected payment/);
    expect(html).toContain("For the forecast. Record payment when the money arrives.");
    expect(html).toContain("Expected payment date");
    expect(html).toContain("Save payment plan");
    expect(html).toContain("Customer promised");
    expect(html).not.toContain("Choose a source");
  });

  it("identifies a valid payment date outside the current forecast", () => {
    const workspace = fixture();
    const invoice = workspace.invoices[0];
    const expectation = workspace.expectations[0];
    expectation.state = "active";
    expectation.remaining_cents = invoice.outstanding_cents;
    const renderPlan = () => renderToStaticMarkup(createElement(CollectionPanel, { workspace, invoice }));
    expectation.expected_date = addDays(workspace.forecastInput.referenceDate, 29);
    expect(renderPlan()).not.toContain("Outside the 30-day forecast");
    expectation.expected_date = addDays(workspace.forecastInput.referenceDate, 30);
    expect(renderPlan()).toContain("Outside the 30-day forecast");
    expect(renderPlan()).not.toContain("needs a payment date");
  });

  it("names each invoice the forecast can't rely on, with a direct fix, instead of a general warning", () => {
    const workspace = fixture();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    workspace.expectations[0].remaining_cents = 3_000_000;
    const html = render(workspace);
    expect(html).toContain("Invoices to fix");
    expect(html).toContain("Incomplete plan: 1 unpaid invoice has money with no expected date");
    expect(html).toContain(`/invoices/${workspace.invoices[0].id}?plan=edit#collection-plan`);
    expect(html).not.toContain("Collection check");
    expect(html).not.toContain("overdue bill");
  });

  it("says in one sentence where an invoice's money stands in the forecast", () => {
    const workspace = fixture();
    const invoice = workspace.invoices[0];
    const expectation = workspace.expectations[0];
    const renderPlan = () => renderToStaticMarkup(createElement(CollectionPanel, { workspace, invoice })).replaceAll("&#x27;", "'");
    expectation.kind = "commitment";
    expectation.state = "active";
    expectation.remaining_cents = invoice.outstanding_cents;
    expectation.expected_date = "2026-10-20";
    expect(renderPlan()).toContain("That date has passed, so it isn’t in the forecast.");
    expect(renderPlan()).toContain("Set a new date");
    expectation.kind = "assumption";
    expect(renderPlan()).toContain("You expected payment on 20 Oct. That date has passed");
    expectation.kind = "commitment";
    expectation.expected_date = addDays(workspace.forecastInput.referenceDate, 3);
    expect(renderPlan()).toMatch(/The customer promised to pay ₱50,000.00 on .+\. It’s in the forecast\./);
    expect(renderPlan()).toContain("Update expected payment");
    workspace.expectations = [];
    expect(renderPlan()).toContain("No payment date yet, so this money isn’t in the forecast.");
    expect(renderPlan()).toContain("Set expected payment");
  });
});

