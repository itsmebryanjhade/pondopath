import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn(), getApprovedReminderText: vi.fn() }));
import { ReminderPanel } from "@/components/reminder-panel";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

type Workspace = ReturnType<typeof uiWorkspace>;
function reminder(workspace: Workspace, state: string, extra: Record<string, unknown> = {}) {
  return {
    id: "rem-1", business_id: workspace.business.id, invoice_id: workspace.invoices[0].id, recipient: "Demo contact",
    body: "Hello, ₱50,000.00 is still owed.", state, version: 2, approval_basis: null, approved_version: null,
    approved_body: null, approved_recipient: null, rejection_reason: null, reviewed_by: null, reviewed_at: null,
    reported_by: null, reported_channel: null, reported_sent_at: null,
    created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", ...extra,
  } as unknown as Workspace["reminders"][number];
}
function render(workspace: Workspace) {
  return renderToStaticMarkup(createElement(ReminderPanel, {
    workspace, invoice: workspace.invoices[0], customer: workspace.customers[0], template: "Template text", collapsible: true,
  }));
}
const mainButtons = (html: string) => (html.match(/class="(?:button"|row-action is-main")/g) ?? []).length;

describe("Payment reminder", () => {
  it("starts with the message form and one save button when nothing is written yet", () => {
    const workspace = uiWorkspace();
    const html = render(workspace);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Write the message below.");
    expect(html).toContain("Template text");
    expect(html).toContain("Save draft");
    expect(mainButtons(html)).toBe(1);
  });

  it("asks the owner to approve or request changes, with the message shown, and only one main button", () => {
    const workspace = uiWorkspace();
    workspace.reminders = [reminder(workspace, "awaiting_review", { approval_basis: { digest: "a".repeat(64) } })];
    const html = render(workspace);
    expect(html).toContain("Waiting for approval");
    expect(html).toContain("Read the message, then approve it or ask for changes.");
    expect(html).toContain("Hello, ₱50,000.00 is still owed.");
    expect(html).toContain("Approve message");
    expect(html).toMatch(/aria-expanded="false"[^>]*>Ask for changes/);
    expect(html).toMatch(/aria-expanded="false"[^>]*>Edit message/);
    expect(html).not.toContain("Resubmit for owner review");
  });

  it("tells a teammate they are waiting for the owner, without approve controls", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance" as typeof workspace.actor.role;
    workspace.reminders = [reminder(workspace, "awaiting_review", { approval_basis: { digest: "a".repeat(64) } })];
    const html = render(workspace);
    expect(html).toContain("Waiting for the owner to approve this message.");
    expect(html).not.toContain("Approve message");
    expect(html).toContain("Send again for approval");
  });

  it("shows the owner's note and one way forward after changes are requested", () => {
    const workspace = uiWorkspace();
    workspace.reminders = [reminder(workspace, "rejected", { rejection_reason: "Use a softer tone" })];
    const html = render(workspace);
    expect(html).toContain("Changes requested");
    expect(html).toContain("Use a softer tone");
    expect(html).toContain("Ask owner to approve");
  });

  it("once approved, offers copy as the main step and marking as sent behind it", () => {
    const workspace = uiWorkspace();
    workspace.reminders = [reminder(workspace, "approved", { approval_basis: { digest: "a".repeat(64) }, approved_version: 2, approved_recipient: "Demo contact" })];
    const html = render(workspace);
    expect(html).toContain("Ready to copy");
    expect(html).toMatch(/class="row-action is-main"[^>]*>Copy message/);
    expect(html).toMatch(/aria-expanded="false"[^>]*>Mark as sent/);
    expect(html).toContain("PondoPath never sends messages for you.");
  });

  it("pre-fills suggestedBody from AI assistant when provided", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(createElement(ReminderPanel, {
      workspace, invoice: workspace.invoices[0], customer: workspace.customers[0],
      template: "Template text", suggestedBody: "AI proposed reminder text", collapsible: true,
    }));
    expect(html).toContain("AI proposed reminder text");
  });
});