import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

import { FollowupForm, FollowupPanel } from "@/components/followup-panel";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

function task(workspace: ReturnType<typeof uiWorkspace>, due_date: string) {
  return {
    id: "task-1", invoice_id: workspace.invoices[0].id, business_id: workspace.business.id, assignee_id: workspace.actor.userId,
    due_date, next_action: "Call Demo customer about the payment", next_date: null, outcome: null, automatic_type: null,
    expectation_id: null, correction_movement_id: null, resolved_by_movement_id: null, completion_source: null, completed_at: null,
    created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", version: 1, state: "open" as const,
  };
}

describe("Follow-ups card", () => {
  it("shows the task, when it is due and who has it, with one main action", () => {
    const workspace = uiWorkspace();
    workspace.followups = [task(workspace, "2026-10-27")];
    const html = renderToStaticMarkup(createElement(FollowupPanel, { workspace, invoice: workspace.invoices[0] }));
    expect(html).toContain("1 open");
    expect(html).toContain("Call Demo customer about the payment");
    expect(html).toContain("Late since 27 Oct");
    expect(html).toMatch(/<span class="sr-only">Assigned to <\/span>You/);
    expect(html).toMatch(/class="row-action is-main"[^>]*>Record what happened/);
    expect(html).toMatch(/class="row-action is-quiet"[^>]*>Change/);
    expect(html).toContain("+ Add another follow-up");
    expect(html).toContain('id="followup-task-1"');
  });

  it("offers to schedule the first follow-up when none is open", () => {
    const workspace = uiWorkspace();
    workspace.followups = [];
    const html = renderToStaticMarkup(createElement(FollowupPanel, { workspace, invoice: workspace.invoices[0] }));
    expect(html).toContain("Nothing scheduled");
    expect(html).toMatch(/class="row-action is-main"[^>]*>\+ Schedule a follow-up/);
  });
});

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
});
