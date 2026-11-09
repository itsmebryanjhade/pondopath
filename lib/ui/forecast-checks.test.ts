import { describe, expect, it } from "vitest";
import { calculateForecast } from "@/lib/domain/forecast";
import { forecastChecks } from "./forecast-checks";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

describe("forecast checks in plain words", () => {
  it("names a passed payment date and links to updating it", () => {
    const workspace = uiWorkspace();
    const planned = workspace.forecastInput.invoices[0];
    planned.expectation = { ...planned.expectation!, date: "2026-10-20" };
    const checks = forecastChecks(workspace, calculateForecast(workspace.forecastInput));
    const check = checks.find((item) => item.key === "past-date");
    expect(check?.title).toBe("1 expected payment date has passed");
    expect(check?.records[0]).toMatchObject({ label: "DEMO-001", detail: "Demo customer · expected 20 Oct", action: "Update date", href: `/invoices/${planned.id}?from=overview&plan=edit#collection-plan` });
  });
  it("names overdue bills counted as due today", () => {
    const workspace = uiWorkspace();
    const forecast = calculateForecast(workspace.forecastInput);
    const checks = forecastChecks(workspace, forecast);
    const bills = checks.find((item) => item.key === "overdue-bills");
    expect(forecast.overdueExpenseIds.length).toBe(bills?.records.length ?? 0);
    if (bills) expect(bills.title).toMatch(/^\d+ overdue bills? (is|are) counted as due today$/);
  });
  it("returns nothing to check when every date is current and no bill is overdue", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.expenses = [];
    workspace.expenses = [];
    const planned = workspace.forecastInput.invoices[0];
    planned.expectation = { ...planned.expectation!, date: "2026-11-15" };
    expect(forecastChecks(workspace, calculateForecast(workspace.forecastInput))).toEqual([]);
  });
  it("keeps an incomplete plan visible and links the Forecast page without the Overview back link", () => {
    const workspace = uiWorkspace();
    const planned = workspace.forecastInput.invoices[0];
    planned.expectation!.remainingCents = 3_000_000;
    const check = forecastChecks(workspace, calculateForecast(workspace.forecastInput), "forecast").find((item) => item.key === "no-date");
    expect(check?.title).toBe("Incomplete plan: 1 unpaid invoice has money with no expected date");
    expect(check?.records[0]).toMatchObject({ detail: "Demo customer · ₱20,000.00 with no expected date", href: `/invoices/${planned.id}?from=forecast&plan=edit#collection-plan` });
  });
});
