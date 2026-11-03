import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CashOverview } from "@/components/cash-overview";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ported dashboard uses the saved cash model", () => {
  it("shows the early gap alongside the later positive balance and four actual metrics", () => {
    const html = renderToStaticMarkup(CashOverview({ workspace: uiWorkspace(), planningTools: null }));
    expect(html).toContain("₱10,000.00");
    expect(html).toContain("30 Oct · ₱40,000.00 gap");
    expect(html.match(/class="summary-card"/g)).toHaveLength(4);
    expect(html).toContain("not been verified as received");
    expect(html).toContain("Overdue invoices");
    expect(html).toContain("Next actions");
    expect(html).toContain("No actions need attention");
    expect(html).not.toContain("Across connected accounts");
  });
  it("does not hide an incomplete partial promise behind a disclosure", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    const html = renderToStaticMarkup(CashOverview({ workspace, planningTools: null }));
    expect(html).toContain('class="hero-incomplete"');
    expect(html).toContain("Incomplete plan: 1 unpaid invoice has");
    expect(html).toContain("remainder unplanned");
  });
});
