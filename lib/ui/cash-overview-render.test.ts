import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CashOverview } from "@/components/cash-overview";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("overview leads with the first gap from the saved cash model", () => {
  it("puts the gap first, links to the days behind it, and keeps the four ledger figures", () => {
    const html = renderToStaticMarkup(CashOverview({ workspace: uiWorkspace(), planningTools: null }));
    expect(html).toContain("short on 30 Oct.");
    expect(html).toContain('href="#day-2026-10-30"');
    expect(html).toContain("See what’s due by 30 Oct");
    expect(html).toContain('id="day-2026-10-30"');
    expect(html).toContain('href="/forecast#forecast-scenario"');
    expect(html.match(/class="ledger-item"/g)).toHaveLength(4);
    expect(html).toContain("not been verified as received");
    expect(html).toContain("Overdue invoices");
    expect(html).toContain("Do next");
    expect(html).toContain("No actions need attention");
    expect(html).toContain("Plan as of");
    expect(html).not.toContain("Across connected accounts");
  });
  it("shows the four workflow steps with their pages", () => {
    const html = renderToStaticMarkup(CashOverview({ workspace: uiWorkspace(), planningTools: null }));
    for (const href of ["/add", "/imports", "/forecast", "/followups"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('aria-label="Your cash workflow"');
    expect(html).toContain("Short from 30 Oct");
  });
  it("does not hide an incomplete partial promise behind a disclosure", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    const html = renderToStaticMarkup(CashOverview({ workspace, planningTools: null }));
    expect(html).toContain('class="answer-incomplete"');
    expect(html).toContain("Incomplete plan: 1 unpaid invoice has");
    expect(html).toContain("remainder unplanned");
  });
});
