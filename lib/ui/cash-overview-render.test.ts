import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CashOverview } from "@/components/cash-overview";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ported dashboard uses the saved cash model", () => {
  it("shows the early gap alongside the later positive balance and four actual metrics", () => {
    const html = renderToStaticMarkup(CashOverview({ workspace: uiWorkspace() }));
    expect(html).toContain("₱10,000.00");
    expect(html).toContain("30 Oct · ₱40,000.00 gap");
    expect(html.match(/class="cash-sum-part /g)).toHaveLength(4);
    expect(html).toContain("How the next 30 days add up");
    expect(html).toContain("not been verified as received");
    expect(html).toMatch(/overdue on \d+ invoices?\.|No overdue invoices\./);
    expect(html).toContain("Next actions");
    expect(html).toContain("All caught up");
    expect(html).not.toContain("Across connected accounts");
  });
  it("breaks the 30-day number into cash now, coming in and going out that add up to it", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(CashOverview({ workspace }));
    const strip = html.slice(html.indexOf('class="cash-sum-row"'), html.indexOf("</ol>", html.indexOf('class="cash-sum-row"')));
    const amounts = [...strip.matchAll(/<strong class="num">(?:<span class="sr-only">[^<]*<\/span>)?(-?₱[\d,]+\.\d{2})<\/strong>/g)].map((m) => Math.round(Number(m[1].replace(/[₱,]/g, "")) * 100));
    expect(amounts).toHaveLength(4);
    const [now, comingIn, goingOut, result] = amounts;
    expect(now + comingIn - goingOut).toBe(result);
  });
  it("does not hide an incomplete partial promise behind a disclosure", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices[0].expectation!.remainingCents = 3_000_000;
    const html = renderToStaticMarkup(CashOverview({ workspace }));
    expect(html).toContain('class="hero-incomplete"');
    expect(html).toContain("Incomplete plan: 1 unpaid invoice has");
    expect(html).toContain("remainder unplanned");
  });
});
