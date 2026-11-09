import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Expenses from "@/app/(workspace)/expenses/page";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({ getWorkspace: vi.fn(), getCashMovements: vi.fn() }));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/record-forms", () => ({ ExpenseForm: ({ expense }: { expense?: { id: string } }) => createElement("form", { "data-expense": expense?.id ?? "new" }) }));
vi.mock("@/components/delete-record-form", () => ({ DeleteRecordForm: ({ id, hasPayments }: { id: string; hasPayments: boolean }) => createElement("form", { "data-delete": id, "data-has-payments": String(hasPayments) }) }));
vi.mock("@/components/payment-form", () => ({ PaymentForm: ({ parentId, remainingCents }: { parentId: string; remainingCents: number }) => createElement("form", { "data-payment": parentId, "data-remaining": remainingCents }), VoidForm: () => null }));

async function render(workspace = uiWorkspace(), page?: string) {
  readers.getWorkspace.mockResolvedValue(workspace);
  readers.getCashMovements.mockResolvedValue([]);
  return renderToStaticMarkup(await Expenses({ searchParams: Promise.resolve({ page }) }));
}

describe("source Expenses page with real planned outflows", () => {
  it("offers Edit bill and Delete bill on every bill, flagging a bill that already has payments", async () => {
    const workspace = uiWorkspace();
    workspace.expenses[0] = { ...workspace.expenses[0], paid_cents: 1_000, unpaid_cents: workspace.expenses[0].amount_cents - 1_000 };
    const html = await render(workspace);
    expect((html.match(/>Edit bill</g) ?? []).length).toBe(workspace.expenses.length);
    expect((html.match(/>Delete bill</g) ?? []).length).toBe(workspace.expenses.length);
    expect(html).toContain(`data-delete="${workspace.expenses[0].id}" data-has-payments="true"`);
  });

  it("offers a contextual AI suggestion beside overdue bills, and not when none are overdue", async () => {
    const overdue = uiWorkspace();
    overdue.expenses[0] = { ...overdue.expenses[0], due_date: "2026-10-28", unpaid_cents: 3_000_000 };
    overdue.forecastInput.expenses = overdue.expenses.map((expense) => ({ id: expense.id, dueDate: expense.due_date, unpaidCents: expense.unpaid_cents }));
    const html = await render(overdue);
    expect(html).toContain("Which bill first?");
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>/);
    const clear = uiWorkspace();
    clear.expenses = clear.expenses.map((expense) => ({ ...expense, due_date: "2026-12-30" }));
    clear.forecastInput.expenses = clear.expenses.map((expense) => ({ id: expense.id, dueDate: expense.due_date, unpaidCents: expense.unpaid_cents }));
    expect(await render(clear)).not.toContain("Which bill first?");
  });

  it("charts only remaining unpaid amounts, brings overdue bills due now, and excludes later bills", async () => {
    const workspace = uiWorkspace();
    workspace.expenses[0] = { ...workspace.expenses[0], due_date: "2026-10-28", unpaid_cents: 3_000_000, paid_cents: 2_000_000 };
    workspace.expenses[1].due_date = "2026-11-05";
    workspace.expenses[2].due_date = "2026-11-28";
    workspace.forecastInput.expenses = workspace.expenses.map((expense) => ({ id: expense.id, dueDate: expense.due_date, unpaidCents: expense.unpaid_cents }));
    const html = await render(workspace);
    expect(html).toContain("section-expenses expenses-page");
    expect([...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([3_000_000, 2_000_000, 0, 0, 0]);
    expect(html).toContain("₱50,000.00");
    const bill = html.slice(html.indexOf('id="expense-' + workspace.expenses[0].id + '"')).split("</li>")[0];
    expect(bill).toContain('dateTime="2026-10-28">28 Oct</time>');
    expect(bill).toContain("Overdue");
    expect(bill).toContain("Left of ₱50,000.00");
    expect(bill).not.toContain("Counted as due today");
    // Three buttons in a fixed row (Record payment, Edit bill, Delete bill); their forms slide open below.
    expect(bill.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(html).toContain("Overdue bills count as due today");
    expect(html).toContain('data-remaining="3000000"');
    expect(html).toContain(`data-expense="${workspace.expenses[0].id}"`);
    // Adding a bill happens on Add records; the header opens that form.
    expect(html).not.toContain('data-expense="new"');
    expect(html).toContain('href="/add?type=expense"');
    // The three metric cards became the breakdown in "Bills you owe".
    expect(html).not.toContain('class="section-metric"');
    expect(html).toContain("Bills to check");
  });
  it("shows the paid total and keeps editing available for a paid bill", async () => {
    const workspace = uiWorkspace();
    const expense = workspace.expenses[0];
    expense.paid_cents = expense.amount_cents;
    expense.unpaid_cents = 0;
    workspace.forecastInput.expenses[0].unpaidCents = 0;
    const html = await render(workspace);
    const bill = html.slice(html.indexOf('id="expense-' + expense.id + '"')).split("</li>")[0];
    expect(bill).toContain(`id="expense-${expense.id}" tabindex="-1"`);
    expect(bill).toContain(">Paid</span>");
    expect(bill).toContain("₱50,000.00");
    expect(bill).toContain("Edit bill");
    expect(bill).not.toContain("Record payment");
  });

  it("retains 50-row pagination and anchors while analytics use all saved expenses", async () => {
    const workspace = uiWorkspace();
    const base = workspace.expenses[0];
    workspace.expenses = Array.from({ length: 51 }, (_, i) => ({ ...base, id: `item-${String(i).padStart(2, "0")}` }));
    workspace.forecastInput.expenses = workspace.expenses.map((expense) => ({ id: expense.id, dueDate: expense.due_date, unpaidCents: expense.unpaid_cents }));
    const html = await render(workspace, "9999");
    expect(html).toContain('id="expense-item-50"');
    expect(html).not.toContain('id="expense-item-49"');
    expect(html).toContain('href="/expenses?page=1"');
    expect(html).toContain('data-cents="255000000"');
  });
  it("handles empty obligations and zero-value chart periods, and leads to adding the first bill", async () => {
    const workspace = uiWorkspace();
    workspace.expenses = [];
    workspace.forecastInput.expenses = [];
    const html = await render(workspace);
    expect(html).toContain("No expenses entered");
    expect([...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([0, 0, 0, 0, 0]);
    expect(html).not.toContain("NaN");
    expect(html).toContain("Add your first bill");
  });
});
