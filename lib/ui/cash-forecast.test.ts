import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashForecast } from "@/components/cash-forecast";
import { calculateForecast } from "@/lib/domain/forecast";
import { delayedCase } from "../../tests/fixtures/business";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";

function render(overview = false) {
  const input = delayedCase();
  input.referenceDate = "2026-10-29";
  // The chart uses identities, labels and due dates for traceable source links.
  const workspace = {
    invoices: [{ id: input.invoices[0].id, number: "DEMO-001" }],
    expenses: input.expenses.map((expense, index) => ({ id: expense.id, due_date: expense.dueDate, label: ["Payroll", "Supplier bill", "Rent"][index] })),
  } as WorkspaceSnapshot;
  const forecast = calculateForecast(input);
  return { html: renderToStaticMarkup(createElement(CashForecast, { forecast, workspace, overview })), forecast, input };
}

describe("traceable cash forecast presentation", () => {
  it("labels the end balance as projected without hiding an earlier shortage", () => {
    const { html } = render();
    expect(html).toContain("Projected end balance");
    expect(html).toContain("30 Oct 2026");
    expect(html).toContain("2 Nov");
    expect(html).toContain("Expected payments are planning assumptions");
  });

  it("plots all 30 calculated days in chronological order, with recovery before 5 November", () => {
    const { html, forecast } = render();
    const raw = html.match(/<polyline[^>]*points="([^"]+)"/)?.[1];
    expect(raw).toBeTruthy();
    const points = raw!.split(" ").map((pair) => pair.split(",").map(Number));
    expect(points).toHaveLength(30);
    expect(points.every(([x], index) => index === 0 || x > points[index - 1][0])).toBe(true);
    expect(forecast.days[4].date).toBe("2026-11-02");
    expect(points[4][0]).toBeLessThan(points[7][0]);
    expect(points[1][1]).toBeGreaterThan(points[4][1]);
    expect(points.slice(4).every((point) => point[1] === points[4][1])).toBe(true);
  });

  it("retains the accessible daily table, actual record links and negative amounts", () => {
    const { html, input } = render();
    expect(html).toContain('aria-label="Daily cash forecast"');
    expect(html.match(/<tbody>([\s\S]+?)<\/tbody>/)?.[1].match(/<tr/g)).toHaveLength(30);
    expect(html).toContain(`/invoices/${input.invoices[0].id}`);
    expect(html).toContain(`/expenses#expense-${input.expenses[0].id}`);
    expect(html).toContain('class="num negative"');
  });

  it("uses all 30 calculated days in the source overview chart, including the early gap", () => {
    const { html, forecast } = render(true);
    expect(html).toContain('class="forecast overview-forecast"');
    const path = html.match(/class="line"[^>]*d="([^"]+)"/)?.[1];
    expect(path).toBeTruthy();
    const points = path!.trim().split(/[ML]/).filter(Boolean).map((pair) => pair.trim().split(/[ ,]+/).map(Number));
    expect(points).toHaveLength(30);
    expect(points.every(([x], index) => index === 0 || x > points[index - 1][0])).toBe(true);
    expect(points[1][1]).toBeGreaterThan(points[4][1]);
    expect(forecast.days[1].closingCents).toBe(-4_000_000);
    expect(html).toContain('data-tooltip="30 Oct 2026 · -₱40,000.00"');
    expect(html).toContain('data-tooltip="27 Nov 2026 · ₱10,000.00"');
    expect(html).toContain('aria-label="Daily cash forecast"');
    expect(html).not.toContain('60d');
  });
});
