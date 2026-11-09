import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FollowupForm, FollowupPanel } from "@/components/followup-panel";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

describe("FollowupForm with proposed AI task fields", () => {
  it("renders with default values when no task or proposal is given", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const html = renderToStaticMarkup(createElement(FollowupForm, { workspace, invoice }));

    expect(html).toContain("Schedule follow-up");
    expect(html).toContain('name="nextAction"');
    expect(html).toContain(`value="${workspace.forecastInput.referenceDate}"`);
    expect(html).toContain(`value="${workspace.actor.userId}"`);
  });

  it("prefills proposed nextAction and date when provided from an AI proposal", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const proposed = {
      nextAction: "Call Accounting manager about unpaid DEMO-001 balance",
      date: "2026-11-10",
    };

    const html = renderToStaticMarkup(
      createElement(FollowupForm, { workspace, invoice, proposed })
    );

    expect(html).toContain("Call Accounting manager about unpaid DEMO-001 balance");
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain(`value="${workspace.actor.userId}"`);
  });

  it("prioritizes existing task values over proposed values when editing an existing task", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const existingTask = {
      id: "task-1",
      business_id: workspace.business.id,
      invoice_id: invoice.id,
      due_date: "2026-11-05",
      next_action: "Existing scheduled call",
      assignee_id: workspace.actor.userId,
      state: "open" as const,
      automatic_type: null,
      correction_movement_id: null,
      outcome: null,
      completion_source: null,
      completed_at: null,
      expectation_id: null,
      resolved_by_movement_id: null,
      next_date: null,
      version: 1,
      created_at: "2026-10-29T00:00:00Z",
      updated_at: "2026-10-29T00:00:00Z",
    };

    const proposed = {
      nextAction: "Proposed action should not override existing",
      date: "2026-11-20",
    };

    const html = renderToStaticMarkup(
      createElement(FollowupForm, { workspace, invoice, task: existingTask, proposed })
    );

    expect(html).toContain("Save follow-up");
    expect(html).toContain("Existing scheduled call");
    expect(html).not.toContain("Proposed action should not override existing");
    expect(html).toContain('value="2026-11-05"');
  });

  it("renders FollowupPanel with open tasks and allows adding a follow-up", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const html = renderToStaticMarkup(createElement(FollowupPanel, { workspace, invoice }));

    expect(html).toContain("Follow-ups");
    expect(html).toContain("Add follow-up");
  });
});
