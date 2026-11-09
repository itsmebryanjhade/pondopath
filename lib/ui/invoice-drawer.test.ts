import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { invoiceList } from "./cash-overview";
import { InvoiceDrawer } from "@/components/invoice-drawer";
import { CashActivity } from "@/components/cash-activity";
import { buildActivityRows } from "./cash-overview";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

function workspace() {
  const value = uiWorkspace();
  const base = value.invoices[0];
  value.invoices = [
    { ...base, id: "paid", number: "INV-PAID", outstanding_cents: 0, paid_cents: base.amount_cents, due_date: "2026-10-01" },
    { ...base, id: "later", number: "INV-LATER", due_date: "2026-11-20" },
    base, // DEMO-001, due 28 Oct: overdue on 29 Oct
  ];
  return value;
}

describe("Review invoices panel", () => {
  it("lists every invoice with overdue first and paid last", () => {
    expect(invoiceList(workspace()).map((item) => [item.number, item.state])).toEqual([
      ["DEMO-001", "overdue"], ["INV-LATER", "open"], ["INV-PAID", "paid"],
    ]);
  });
  it("opens from a button and links each invoice to its own review page", () => {
    const html = renderToStaticMarkup(createElement(InvoiceDrawer, { invoices: invoiceList(workspace()) }));
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Review invoices/);
    expect(html).toContain('href="/invoices/later?from=overview"');
    expect(html).toContain("₱100,000.00 unpaid · 1 overdue");
    expect(html).toContain('href="/invoices"');
  });
  it("sends an invoice row in Cash-flow activity straight to that invoice", () => {
    const value = workspace();
    const html = renderToStaticMarkup(createElement(CashActivity, { rows: buildActivityRows(value), invoices: invoiceList(value) }));
    expect(html).toContain(`href="/invoices/${value.invoices[2].id}?from=overview"`);
    expect(html).not.toMatch(/<a[^>]*href="\/invoices"[^>]*class="row-action section-action"/);
  });
});
