import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));
import { InvoiceForm } from "@/components/record-forms";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const render = (workspace: ReturnType<typeof uiWorkspace>, locked: boolean) =>
  renderToStaticMarkup(createElement(InvoiceForm, { workspace, invoice: workspace.invoices[0], locked }));

describe("Edit invoice", () => {
  it("lets every field change before any payment, without asking for a reason", () => {
    const workspace = uiWorkspace();
    const html = render(workspace, false);
    expect(html).toContain("Invoice number");
    expect(html).toContain('name="customerId"');
    expect(html).toContain("Invoice total (PHP)");
    expect(html).toContain("Due date");
    expect(html).not.toContain('name="reason"');
    expect(html).toContain("Save changes");
  });

  it("after a payment, shows number and customer as locked text and asks the owner why", () => {
    const workspace = uiWorkspace();
    const html = render(workspace, true);
    expect(html).toContain("Locked because a payment is recorded");
    expect(html).toMatch(/<input type="hidden" name="number"/);
    expect(html).toMatch(/<input type="hidden" name="customerId"/);
    expect(html).toMatch(/name="reason"[^>]*required|required[^>]*name="reason"/);
  });

  it("after a payment, tells a teammate only the owner can change it, with no form", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance" as typeof workspace.actor.role;
    const html = render(workspace, true);
    expect(html).toContain("only the owner can change its total or due date");
    expect(html).not.toContain("<form");
  });
});
