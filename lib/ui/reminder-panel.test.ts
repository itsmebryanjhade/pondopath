import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReminderPanel } from "@/components/reminder-panel";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({
  executeWorkspaceAction: vi.fn(),
  getApprovedReminderText: vi.fn(),
}));

describe("ReminderPanel with suggestedBody & finance-to-owner approval", () => {
  it("prefills suggestedBody from AI proposal and opens the edit disclosure", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const customer = workspace.customers[0];
    const suggested = "Hello, gentle reminder regarding DEMO-001.";

    const html = renderToStaticMarkup(
      createElement(ReminderPanel, {
        workspace,
        invoice,
        customer,
        template: "Default template",
        suggestedBody: suggested,
      })
    );

    expect(html).toContain("Payment reminder");
    expect(html).toContain("Hello, gentle reminder regarding DEMO-001.");
    expect(html).toContain("Save draft");
    expect(html).toContain('open=""');
  });

  it("restricts owner approval buttons from finance teammates, allowing submit for review", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance";
    const invoice = workspace.invoices[0];
    const customer = workspace.customers[0];

    // Seed a reminder awaiting review
    workspace.reminders = [
      {
        id: "rem-1",
        business_id: workspace.business.id,
        invoice_id: invoice.id,
        recipient: "accounting@demo.com",
        body: "Draft reminder awaiting review",
        state: "awaiting_review",
        version: 1,
        approval_basis: { digest: "mock-digest-123" },
        approved_version: null,
        approved_body: null,
        approved_recipient: null,
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by: null,
        reported_by: null,
        reported_channel: null,
        reported_sent_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(ReminderPanel, {
        workspace,
        invoice,
        customer,
        template: "Default",
      })
    );

    expect(html).toContain("Resubmit for owner review");
    // Finance cannot approve or reject
    expect(html).not.toContain("Approve this version");
    expect(html).not.toContain("Request changes");
  });

  it("shows approval and change request controls to owner when reminder is awaiting review", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "owner";
    const invoice = workspace.invoices[0];
    const customer = workspace.customers[0];

    workspace.reminders = [
      {
        id: "rem-1",
        business_id: workspace.business.id,
        invoice_id: invoice.id,
        recipient: "accounting@demo.com",
        body: "Draft reminder awaiting review",
        state: "awaiting_review",
        version: 1,
        approval_basis: { digest: "mock-digest-123" },
        approved_version: null,
        approved_body: null,
        approved_recipient: null,
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by: null,
        reported_by: null,
        reported_channel: null,
        reported_sent_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(ReminderPanel, {
        workspace,
        invoice,
        customer,
        template: "Default",
      })
    );

    expect(html).toContain("Approve this version");
    expect(html).toContain("Request changes");
  });

  it("displays fully paid empty state when invoice outstanding balance is zero", () => {
    const workspace = uiWorkspace();
    const invoice = { ...workspace.invoices[0], outstanding_cents: 0 };
    const customer = workspace.customers[0];

    const html = renderToStaticMarkup(
      createElement(ReminderPanel, {
        workspace,
        invoice,
        customer,
        template: "Default",
      })
    );

    expect(html).toContain("No reminder can be prepared because the invoice is fully paid.");
    expect(html).not.toContain("Save draft");
  });
});
