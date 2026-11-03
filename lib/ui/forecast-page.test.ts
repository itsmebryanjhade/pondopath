import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ForecastPage from "@/app/(workspace)/forecast/page";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({ getWorkspace: vi.fn() }));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/scenario-panel", () => ({ ScenarioPanel: () => createElement("details", { "data-scenario": true }) }));

async function render(workspace = uiWorkspace()) {
  readers.getWorkspace.mockResolvedValue(workspace);
  return renderToStaticMarkup(await ForecastPage());
}

describe("source Forecast layout preserves calculated risk", () => {
  it("shows the early cash gap alongside a positive end balance and every daily source", async () => {
    const html = await render();
    expect(html).toContain("section-forecast forecast-page overview-page");
    expect(html).toContain("₱10,000.00");
    expect(html).toContain("₱40,000.00 on 30 Oct 2026");
    expect(html).toContain("₱50,000.00");
    expect(html).toContain("₱80,000.00");
    expect(html).toContain('id="forecast-main-chart-fill"');
    expect(html.match(/<tbody>([\s\S]+?)<\/tbody>/)?.[1].match(/<tr/g)).toHaveLength(30);
    expect(html).toContain("data-scenario=");
    expect(html).toContain(`/invoices/${uiWorkspace().invoices[0].id}?plan=edit#collection-plan`);
    expect(html).toContain("Review expected payment for");
  });
  it("keeps incomplete promises and overdue due-now expenses visible", async () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    workspace.forecastInput.expenses[0].dueDate = "2026-10-28";
    const html = await render(workspace);
    expect(html).toContain("Incomplete plan: 1 unpaid invoices");
    expect(html).toContain("1 overdue expenses treated as due now");
    expect(html).toContain("Largest projected shortfall");
    expect(html).toContain("Zero cash leaves no buffer");
  });
  it("provides a clear scenario empty state without hiding a negative end balance", async () => {
    const workspace = uiWorkspace();
    workspace.invoices = [];
    workspace.forecastInput.invoices = [];
    const html = await render(workspace);
    expect(html).toContain("No unpaid invoices are available");
    expect(html).not.toContain("data-scenario=");
    expect(html).toContain("-₱40,000.00");
    expect(html).toContain('class="num forecast-below-zero"');
    expect(html).not.toContain("Review expected payment for");
  });
});
