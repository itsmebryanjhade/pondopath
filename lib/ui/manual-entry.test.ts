import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));
import { ManualEntry } from "@/components/manual-entry";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const html = (initial?: "invoice" | "expense" | "receipt", workspace = uiWorkspace()) =>
  renderToStaticMarkup(createElement(ManualEntry, { workspace, initial })).replaceAll("&#x27;", "'");

describe("typing a record in on Add records", () => {
  it("offers invoice, expense and payment tabs, with the invoice form open first", () => {
    const markup = html();
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    expect(markup).toMatch(/aria-selected="true"[^>]*>[\s\S]*?Invoice/);
    expect(markup).toContain("Add invoice");
    expect(markup).not.toContain('href="/invoices#new-invoice"');
  });
  it("opens the invoice form with the new-customer panel when the business has no customers", () => {
    const workspace = uiWorkspace();
    workspace.customers = [];
    const markup = html("invoice", workspace);
    expect(markup).toContain("Add your first customer");
    expect(markup).toContain("Add customer");
    expect(markup).toContain("Add invoice");
  });
  it("offers to add a new customer from the invoice's Customer dropdown", () => {
    const markup = html("invoice");
    expect(markup).toContain('<option value="__new__">+ Add a new customer…</option>');
    expect(markup).not.toContain("Customer not listed?");
    expect(markup).not.toContain("New customer");
  });
  it("opens the expense form in place", () => {
    expect(html("expense")).toContain("Add expense");
  });
  it("lists unpaid invoices to choose before recording a payment", () => {
    const markup = html("receipt");
    expect(markup).toContain("Which invoice was paid?");
    expect(markup).toContain("DEMO-001 · Demo customer · ₱50,000.00 unpaid");
    // The receipt form appears only after an invoice is chosen.
    expect(markup).not.toContain("Record verified receipt");
  });
  it("says what to do when nothing is unpaid", () => {
    const workspace = uiWorkspace();
    workspace.invoices = [];
    expect(html("receipt", workspace)).toContain("No unpaid invoices yet");
  });
});
