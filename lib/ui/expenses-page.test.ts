import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Expenses from "@/app/(workspace)/expenses/page";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({ getWorkspace: vi.fn(), getCashMovements: vi.fn() }));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/record-forms", () => ({ ExpenseForm: ({ expense }: { expense?: { id: string } }) => createElement("form", { "data-expense": expense?.id ?? "new" }) }));
vi.mock("@/components/payment-form", () => ({ PaymentForm: ({ parentId, remainingCents }: { parentId: string; remainingCents: number }) => createElement("form", { "data-payment": parentId, "data-remaining": remainingCents }), VoidForm: () => null }));

async function render(workspace = uiWorkspace(), page?: string) {
  readers.getWorkspace.mockResolvedValue(workspace);
  readers.getCashMovements.mockResolvedValue([]);
  return renderToStaticMarkup(await Expenses({ searchParams: Promise.resolve({ page }) }));
}

describe("source Expenses page with real planned outflows", () => {
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
    expect(html).toContain("Included as due now on");
    expect(html).toContain("2026-10-28");
    expect(html).toContain('data-remaining="3000000"');
    expect(html).toContain(`data-expense="${workspace.expenses[0].id}"`);
    expect(html).toContain('data-expense="new"');
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
  it("handles empty obligations and zero-value chart periods without losing the entry form", async () => {
    const workspace = uiWorkspace();
    workspace.expenses = [];
    workspace.forecastInput.expenses = [];
    const html = await render(workspace);
    expect(html).toContain("No expenses entered");
    expect([...html.matchAll(/data-cents="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([0, 0, 0, 0, 0]);
    expect(html).not.toContain("NaN");
    expect(html).toContain('data-expense="new"');
  });
});
