import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildNextActions } from "@/lib/ui/next-actions";
import { NextActions } from "@/components/next-actions";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

it("includes pending imported proposals with a source link but excludes resolved items", () => {
  const workspace = uiWorkspace();
  workspace.intakeReviews = [{ id: "pending-1", external_id: "row-0001", status: "needs_match" }, { id: "done-1", external_id: "row-0002", status: "applied" }];
  const actions = buildNextActions(workspace).filter(action => action.kind === "intake_review");
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ href: "/imports?item=pending-1#item-pending-1", assigneeId: null, dueDate: null, ownerReviewRequired: false });
  expect(actions[0].detail).toContain("row-0001");
});

function expectation(
  workspace: WorkspaceSnapshot,
  overrides: Partial<WorkspaceSnapshot["expectations"][number]> = {},
): WorkspaceSnapshot["expectations"][number] {
  return {
    id: "expectation-1",
    business_id: workspace.business.id,
    invoice_id: workspace.invoices[0].id,
    amount_cents: 5_000_000,
    remaining_cents: 5_000_000,
    expected_date: "2026-10-28",
    kind: "commitment",
    state: "active",
    confirmed_at: "2026-10-27T00:00:00Z",
    confirmed_by: workspace.actor.userId,
    source_note: "Customer confirmed payment date",
    version: 1,
    ...overrides,
  };
}

function followup(
  workspace: WorkspaceSnapshot,
  overrides: Partial<WorkspaceSnapshot["followups"][number]> = {},
): WorkspaceSnapshot["followups"][number] {
  return {
    id: "followup-1",
    invoice_id: workspace.invoices[0].id,
    business_id: workspace.business.id,
    assignee_id: workspace.actor.userId,
    due_date: "2026-10-29",
    next_action: "Check whether the customer paid",
    next_date: null,
    outcome: null,
    automatic_type: null,
    expectation_id: null,
    correction_movement_id: null,
    resolved_by_movement_id: null,
    completion_source: null,
    completed_at: null,
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:00:00Z",
    version: 1,
    state: "open",
    ...overrides,
  };
}

function reminder(workspace: WorkspaceSnapshot): WorkspaceSnapshot["reminders"][number] {
  return {
    id: "reminder-1",
    business_id: workspace.business.id,
    invoice_id: workspace.invoices[0].id,
    recipient: "Demo contact",
    body: "Please review the saved payment reminder.",
    state: "awaiting_review",
    version: 1,
    approval_basis: null,
    approved_body: null,
    approved_recipient: null,
    approved_version: null,
    reported_by: null,
    reported_channel: null,
    reported_sent_at: null,
    rejection_reason: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:00:00Z",
  };
}

describe("buildNextActions", () => {
  it("routes a missed promise through its existing open follow-up", () => {
    const workspace = uiWorkspace();
    const promise = expectation(workspace);
    workspace.expectations = [promise];
    workspace.forecastInput.invoices[0].expectation = {
      id: promise.id,
      date: promise.expected_date,
      remainingCents: promise.remaining_cents,
      kind: "commitment",
      needsReview: false,
    };
    workspace.followups = [followup(workspace, { expectation_id: promise.id })];

    const actions = buildNextActions(workspace);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "followup:followup-1",
      kind: "missed_promise",
      href: `/invoices/${workspace.invoices[0].id}`,
      assigneeId: workspace.actor.userId,
      dueDate: "2026-10-29",
      ownerReviewRequired: false,
    });
    expect(actions[0].detail).toContain("28 Oct");
  });

  it("shows a missing receipt expectation as unscheduled and unassigned", () => {
    const workspace = uiWorkspace();
    workspace.forecastInput.invoices[0].expectation = null;

    expect(buildNextActions(workspace)).toContainEqual(expect.objectContaining({
      id: `missing-expectation:${workspace.invoices[0].id}`,
      kind: "missing_expectation",
      href: `/invoices/${workspace.invoices[0].id}`,
      assigneeId: null,
      dueDate: null,
      ownerReviewRequired: false,
    }));
  });

  it("routes an open follow-up for an on-time expectation", () => {
    const workspace = uiWorkspace();
    const promise = expectation(workspace, { expected_date: "2026-11-02", kind: "assumption" });
    workspace.expectations = [promise];
    workspace.forecastInput.invoices[0].expectation = {
      id: promise.id,
      date: promise.expected_date,
      remainingCents: promise.remaining_cents,
      kind: "assumption",
      needsReview: false,
    };
    workspace.followups = [followup(workspace, { expectation_id: promise.id })];

    expect(buildNextActions(workspace)).toContainEqual(expect.objectContaining({
      id: "followup:followup-1",
      kind: "followup",
      assigneeId: workspace.actor.userId,
      dueDate: "2026-10-29",
    }));
  });

  it("assigns a pending reminder review to the owner", () => {
    const workspace = uiWorkspace();
    workspace.reminders = [reminder(workspace)];

    expect(buildNextActions(workspace)).toContainEqual(expect.objectContaining({
      id: "reminder-review:reminder-1",
      kind: "reminder_review",
      href: `/invoices/${workspace.invoices[0].id}`,
      assigneeId: workspace.actor.userId,
      dueDate: workspace.invoices[0].due_date,
      ownerReviewRequired: true,
    }));
  });

  it("does not surface completed follow-ups", () => {
    const workspace = uiWorkspace();
    const promise = expectation(workspace, { expected_date: "2026-11-02", kind: "assumption" });
    workspace.expectations = [promise];
    workspace.forecastInput.invoices[0].expectation = {
      id: promise.id,
      date: promise.expected_date,
      remainingCents: promise.remaining_cents,
      kind: "assumption",
      needsReview: false,
    };
    workspace.followups = [followup(workspace, { state: "completed", expectation_id: promise.id })];

    expect(buildNextActions(workspace)).toEqual([]);
  });

  it("returns an empty list for an empty workspace", () => {
    const workspace = uiWorkspace();
    workspace.invoices = [];
    workspace.expectations = [];
    workspace.followups = [];
    workspace.reminders = [];
    workspace.forecastInput.invoices = [];

    expect(buildNextActions(workspace)).toEqual([]);
  });
});

describe("NextActions source links", () => {
  it("identifies each invoice when several records need the same action", () => {
    const workspace = uiWorkspace();
    const secondInvoice = { ...workspace.invoices[0], id: "second-invoice", number: "INV-002" };
    workspace.invoices.push(secondInvoice);
    workspace.forecastInput.invoices[0].expectation = null;
    workspace.forecastInput.invoices.push({ ...workspace.forecastInput.invoices[0], id: secondInvoice.id });

    const html = renderToStaticMarkup(createElement(NextActions, { workspace }));
    const links = html.match(/<a\b[^>]*>/g) ?? [];

    expect(links).toHaveLength(2);
    for (const invoice of workspace.invoices) {
      const sourceLink = links.find((link) => link.includes(`href="/invoices/${invoice.id}"`));
      expect(sourceLink).toContain(invoice.number);
    }
    expect(html).toContain("Unassigned");
    expect(html).toContain("No date set");
  });
});
