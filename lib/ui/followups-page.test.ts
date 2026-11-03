import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FollowupsPage from "@/app/(workspace)/followups/page";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({ getWorkspace: vi.fn() }));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/followup-panel", () => ({ FollowupPanel: ({ invoice }: { invoice: { id: string } }) => createElement("section", { "data-followup-invoice": invoice.id }) }));
vi.mock("@/components/automation-check", () => ({ AutomationCheck: () => createElement("button", null, "Check now") }));

function task(index: number, due_date: string, state = "open"): WorkspaceSnapshot["followups"][number] {
  const workspace = uiWorkspace();
  return {
    id: `task-${index}`, invoice_id: workspace.invoices[0].id, business_id: workspace.business.id,
    assignee_id: workspace.actor.userId, due_date, state, next_action: `Review collection ${index}`,
    next_date: null, outcome: null, automatic_type: null, expectation_id: null,
    correction_movement_id: null, resolved_by_movement_id: null, completion_source: null,
    completed_at: null, created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", version: 1,
  };
}
async function render(workspace = uiWorkspace(), page?: string) {
  readers.getWorkspace.mockResolvedValue(workspace);
  return renderToStaticMarkup(await FollowupsPage({ searchParams: Promise.resolve({ page }) }));
}

describe("source Follow-ups layout preserves the action ledger", () => {
  it("counts task categories but includes each unpaid invoice balance only once", async () => {
    const workspace = uiWorkspace();
    workspace.followups = [task(0, "2026-10-28"), task(1, "2026-10-29"), task(2, "2026-10-30"), task(3, "2026-10-20", "completed")];
    workspace.automation.stale = true;
    const html = await render(workspace);
    expect(html).toContain("section-follow-ups followups-page");
    expect(html).toContain("Next actions");
    expect(html).toContain('id="followup-queue"');
    expect(html).toContain('aria-label="Review action: Review collection 0. DEMO-001 · Demo customer"');
    expect(html).toMatch(/Amount tied to open follow-ups<\/span><strong[^>]*>₱50,000.00/);
    expect([...html.matchAll(/data-count="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([1, 1, 1]);
    expect(html).toContain("Automatic follow-up checks are not current");
    expect(html).toContain(`href="/invoices/${workspace.invoices[0].id}"`);
    expect(html).toContain(`data-followup-invoice="${workspace.invoices[0].id}"`);
    expect(html).toContain("Completed actions");
  });
  it("retains stable 20-invoice pagination and global counts outside the current page", async () => {
    const workspace = uiWorkspace();
    const base = workspace.invoices[0];
    workspace.invoices = Array.from({ length: 21 }, (_, i) => ({ ...base, id: `invoice-${String(i).padStart(2, "0")}`, number: `INV-${String(i).padStart(2, "0")}` }));
    workspace.followups = workspace.invoices.map((invoice, i) => ({ ...task(i, "2026-10-29"), invoice_id: invoice.id }));
    const html = await render(workspace, "9999");
    expect(html).toContain('data-followup-invoice="invoice-20"');
    expect(html).not.toContain('data-followup-invoice="invoice-19"');
    expect(html).toContain('href="/followups?page=1"');
    expect(html).toContain('data-count="21"');
    expect(html).toContain("₱1,050,000.00");
  });
  it("keeps the real empty state and zero analytics without sample tasks", async () => {
    const html = await render();
    expect(html).toContain("No follow-up tasks entered");
    expect([...html.matchAll(/data-count="(\d+)"/g)].map((match) => Number(match[1]))).toEqual([0, 0, 0]);
    expect(html).not.toContain("NaN");
    expect(html).toContain('href="/invoices?filter=no_followup"');
    expect(html).not.toContain("data-followup-invoice=");
  });
  it("discloses the last scheduled failure and keeps a manual fallback", async () => {
    const workspace = uiWorkspace();
    workspace.automation = { stale: true, lastSuccessAt: null, lastAttemptAt: "2026-10-29T07:00:00Z", lastStatus: "failed", lastErrorCode: "HTTP_ERROR", lastManualAt: "2026-10-29T07:05:00Z" };
    const html = await render(workspace);
    expect(html).toContain("Check now");
    expect(html).toContain("failed: HTTP_ERROR");
    expect(html).toContain("Scheduled success: Never");
    expect(html).toContain("Scheduled status is tracked separately");
  });
});
