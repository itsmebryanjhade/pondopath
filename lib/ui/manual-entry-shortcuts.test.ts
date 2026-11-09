import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

import {
  InvoiceForm,
  ExpenseForm,
  buildInvoicePayload,
  buildExpensePayload,
  buildOpeningCashPayload,
} from "@/components/record-forms";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const htmlInvoice = (workspace = uiWorkspace(), invoice?: Parameters<typeof InvoiceForm>[0]["invoice"]) =>
  renderToStaticMarkup(createElement(InvoiceForm, { workspace, invoice })).replaceAll("&#x27;", "'");

const htmlExpense = (workspace = uiWorkspace(), expense?: Parameters<typeof ExpenseForm>[0]["expense"]) =>
  renderToStaticMarkup(createElement(ExpenseForm, { workspace, expense })).replaceAll("&#x27;", "'");

describe("manual-entry shortcuts in InvoiceForm", () => {
  it("defaults invoice due date to plan date plus 30 days and bill due date to plan date", () => {
    const workspace = uiWorkspace();
    // Reference date is 2026-10-29; invoice due date defaults to 2026-11-28 (+30 days)
    const invoiceMarkup = htmlInvoice(workspace);
    expect(invoiceMarkup).toContain('name="dueDate" value="2026-11-28"');
    expect(invoiceMarkup).toContain('class="quick-date-chip is-selected">+30 days</button>');

    // Bill due date defaults to plan date (2026-10-29)
    const expenseMarkup = htmlExpense(workspace);
    expect(expenseMarkup).toContain('name="dueDate" value="2026-10-29"');
    expect(expenseMarkup).toContain('class="quick-date-chip is-selected">Today</button>');
  });

  it("suggests the next sequential invoice number based on existing workspace invoices", () => {
    const workspace = uiWorkspace();
    // workspace has DEMO-001
    const markup = htmlInvoice(workspace);
    expect(markup).toContain('value="DEMO-002"');
    expect(markup).toContain("Suggested: DEMO-002 (editable)");
  });

  it("suggests next number 1025 when last invoice number is 1024", () => {
    const workspace = uiWorkspace();
    workspace.invoices = [{ ...workspace.invoices[0], number: "1024" }];
    const markup = htmlInvoice(workspace);
    expect(markup).toContain('value="1025"');
    expect(markup).toContain("Suggested: 1025 (editable)");
  });

  it("defaults to INV-001 when there are no existing invoices", () => {
    const workspace = uiWorkspace();
    workspace.invoices = [];
    const markup = htmlInvoice(workspace);
    expect(markup).toContain('value="INV-001"');
    expect(markup).toContain("Suggested: INV-001 (editable)");
  });

  it("renders quick date choices including Today, +7 days, +15 days, +30 days, and End of month", () => {
    const markup = htmlInvoice();
    expect(markup).toContain('aria-label="Quick date choices"');
    expect(markup).toContain("Today");
    expect(markup).toContain("+7 days");
    expect(markup).toContain("+15 days");
    expect(markup).toContain("+30 days");
    expect(markup).toContain("End of month");
  });

  it("renders Save and add another button when adding a new invoice", () => {
    const markup = htmlInvoice();
    expect(markup).toContain("Save and add another");
    expect(markup).toContain("Add invoice");
  });

  it("does not render Save and add another when editing an existing invoice", () => {
    const workspace = uiWorkspace();
    const existing = workspace.invoices[0];
    const markup = htmlInvoice(workspace, existing);
    expect(markup).not.toContain("Save and add another");
    expect(markup).toContain("Save invoice");
  });

  it("renders amount shorthand help instructions", () => {
    const markup = htmlInvoice();
    expect(markup).toContain("Use k or m for shorthand (e.g. 15k, 1.5m). No commas or ₱ sign.");
  });
});

describe("manual-entry shortcuts in ExpenseForm", () => {
  it("renders quick date choices and Save and add another button", () => {
    const markup = htmlExpense();
    expect(markup).toContain('aria-label="Quick date choices"');
    expect(markup).toContain("Today");
    expect(markup).toContain("+7 days");
    expect(markup).toContain("+15 days");
    expect(markup).toContain("+30 days");
    expect(markup).toContain("End of month");
    expect(markup).toContain("Save and add another");
    expect(markup).toContain("Add expense");
    expect(markup).toContain("Use k or m for shorthand (e.g. 15k, 1.5m). No commas or ₱ sign.");
  });

  it("does not render Save and add another when editing an existing expense", () => {
    const workspace = uiWorkspace();
    const existing = workspace.expenses[0];
    const markup = htmlExpense(workspace, existing);
    expect(markup).not.toContain("Save and add another");
    expect(markup).toContain("Save expense");
  });
});

describe("command payload preservation with amount shorthand", () => {
  it("builds save_invoice command with amountCents parsed from shorthand (25k -> 2500000, 1.2M -> 120000000, ₱25,000 -> 2500000)", () => {
    const makeCommand = (amount: string) => {
      const fd = new FormData();
      fd.set("number", "INV-002");
      fd.set("customerId", "cust-1");
      fd.set("amount", amount);
      fd.set("dueDate", "2026-11-28");
      return buildInvoicePayload(fd);
    };

    expect(makeCommand("25k").payload.amountCents).toBe(2_500_000);
    expect(makeCommand("1.2M").payload.amountCents).toBe(120_000_000);
    expect(makeCommand("₱25,000").payload.amountCents).toBe(2_500_000);
  });

  it("throws clear RangeError on invalid shorthand input", () => {
    const fd = new FormData();
    fd.set("number", "INV-002");
    fd.set("customerId", "cust-1");
    fd.set("amount", "25kk");
    fd.set("dueDate", "2026-11-28");

    expect(() => buildInvoicePayload(fd)).toThrow(
      "Enter an amount such as 1000.50, without commas or currency symbols."
    );
  });

  it("builds save_expense command with amountCents parsed from shorthand (2.5k -> 250000)", () => {
    const fd = new FormData();
    fd.set("label", "Internet Bill");
    fd.set("payee", "PLDT");
    fd.set("amount", "2.5k");
    fd.set("dueDate", "2026-11-15");

    const command = buildExpensePayload(fd);
    expect(command.type).toBe("save_expense");
    expect(command.payload).toEqual({
      label: "Internet Bill",
      payee: "PLDT",
      amountCents: 250_000,
      dueDate: "2026-11-15",
    });
  });

  it("builds set_opening_cash command with amountCents parsed from shorthand (50k -> 5000000)", () => {
    const fd = new FormData();
    fd.set("amount", "50k");
    fd.set("date", "2026-10-29");

    const command = buildOpeningCashPayload(fd);
    expect(command.type).toBe("set_opening_cash");
    expect(command.payload).toEqual({
      amountCents: 5_000_000,
      date: "2026-10-29",
    });
  });
});

