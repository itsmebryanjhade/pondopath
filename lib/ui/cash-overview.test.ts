import { describe, expect, it } from "vitest";
import { buildActivityRows, filterActivityRows } from "./cash-overview";
import { filterFromHash } from "./cash-overview";
import { delayedCase } from "../../tests/fixtures/business";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";

function fixture() {
  const input = delayedCase();
  input.referenceDate = "2026-10-29";
  return {
    forecastInput: input,
    customers: [{ id: "customer-1", name: "Fictional services" }],
    invoices: [{ id: input.invoices[0].id, number: "DEMO-001", customer_id: "customer-1", outstanding_cents: 5_000_000, due_date: "2026-10-28" }, { id: "paid", outstanding_cents: 0 }],
    expenses: input.expenses.map((expense, i) => ({ id: expense.id, due_date: expense.dueDate, unpaid_cents: expense.unpaidCents, label: ["Payroll", "Supplier bill", "Rent"][i], payee: "Fictional payee" })),
  } as WorkspaceSnapshot;
}

describe("live cash-flow activity", () => {
  it("uses outstanding records and source links rather than the reference's static transactions", () => {
    const rows = buildActivityRows(fixture());
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ kind: "invoice", label: "Fictional services", reference: "DEMO-001", amountCents: 5_000_000, status: "Overdue", needsAttention: true });
    expect(rows[0].href).toContain("/invoices/10000000-");
    expect(rows[1].href).toContain("/expenses#expense-");
    expect(rows[0].expected).toBe("2 Nov 2026");
  });

  it("keeps unplanned partial promises and overdue due-now obligations visible", () => {
    const workspace = fixture();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    workspace.expenses[0].due_date = "2026-10-20";
    const rows = buildActivityRows(workspace);
    expect(rows.find((row) => row.kind === "invoice")!.expected).toContain("remainder unplanned");
    expect(rows.find((row) => row.reference === "Payroll")).toMatchObject({ status: "Overdue · due now", needsAttention: true });
  });

  it("filters actual review states and searches labels/references without changing source rows", () => {
    const rows = buildActivityRows(fixture());
    expect(filterActivityRows(rows, "expenses")).toHaveLength(3);
    expect(filterActivityRows(rows, "attention")).toHaveLength(1);
    expect(filterActivityRows(rows, "all", " demo-001 ")).toHaveLength(1);
    expect(filterActivityRows(rows, "all", "fictional payee")).toHaveLength(3);
    expect(filterActivityRows(rows, "all", "missing")).toHaveLength(0);
    expect(rows).toHaveLength(4);
  });

  it("links to the expense's actual page even when earlier records have already been paid", () => {
    const workspace = fixture();
    workspace.expenses = Array.from({ length: 51 }, (_, i) => ({ ...workspace.expenses[0], id: `item-${String(i).padStart(2, "0")}`, unpaid_cents: i === 50 ? 1000 : 0 }));
    expect(buildActivityRows(workspace).find((row) => row.kind === "expense")?.href).toBe("/expenses?page=2#expense-item-50");
  });
});

describe("activity filter from a link", () => {
  it("opens on Needs attention when the link asks for it", () => {
    expect(filterFromHash("#needs-attention")).toBe("attention");
    expect(filterFromHash("")).toBe("all");
    expect(filterFromHash("#cash-activity")).toBe("all");
  });
});
