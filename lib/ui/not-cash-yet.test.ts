import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CashPosition } from "@/components/cash-position";
import { calculateForecast } from "@/lib/domain/forecast";
import { expectedReceipts } from "./cash-overview";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const render = (workspace = uiWorkspace()) => renderToStaticMarkup(CashPosition({ workspace, receipts: [], payments: [], openingControls: null }));

describe("Not cash yet card", () => {
  it("lists what the forecast expects from customers, with the same amounts", () => {
    const workspace = uiWorkspace();
    const forecast = calculateForecast(workspace.forecastInput);
    const items = expectedReceipts(workspace, forecast);
    const total = items.reduce((sum, item) => sum + item.amountCents, 0);
    expect(total).toBe(forecast.days.reduce((sum, day) => sum + day.expectedInCents, 0));
    expect(items.map((item) => item.number)).toEqual(items.length ? ["DEMO-001"] : []);
  });
  it("shows the expected total apart from available cash and links each invoice", () => {
    const workspace = uiWorkspace();
    const html = render(workspace);
    expect(html).toContain("Not cash yet");
    expect(html).toContain("expected");
    expect(html).toContain(`href="/invoices/${workspace.invoices[0].id}"`);
    expect(html).toContain("isn&#x27;t in your available cash");
    expect(html).not.toContain("Expected is not received");
  });
  it("says so when no payment is expected", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices = [];
    const html = render(workspace);
    expect(html).toContain("Nothing expected yet");
    expect(html).toContain('href="/invoices"');
  });
});
