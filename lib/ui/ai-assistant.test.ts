import { createElement, createRef, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiAssistant, DraftReviewPanel, WORKSPACE_TOOLS } from "@/components/ai-assistant";
import { AiAssistantLauncher } from "@/components/ai-assistant-launcher";
import { CollectionPanel } from "@/components/collection-panel";
import { ReminderPanel } from "@/components/reminder-panel";
import { CustomerForm, ExpenseForm, InvoiceForm } from "@/components/record-forms";
import { executeWorkspaceAction } from "@/app/(workspace)/actions";
import { generatePageStarters, resolveAssistantDraftTarget } from "./assistant-chat-adapter";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(workspace)/actions", () => ({
  executeWorkspaceAction: vi.fn(),
  getApprovedReminderText: vi.fn(),
}));

const renderDialog = (workspace = uiWorkspace()) => renderToStaticMarkup(createElement(AiAssistant, {
  workspace, dialog: createRef<HTMLDialogElement>(), onClose: () => {},
}));

describe("multilingual assistant presentation & Task 4 conversation UI", () => {
  it("has a named native dialog, language choices, New chat button, privacy notice and manual fallback", () => {
    const html = renderDialog();
    for (const text of [
      "<dialog",
      "aria-labelledby",
      "Close AI assistant",
      "New chat",
      "Match my language",
      "Tagalog",
      "Taglish",
      "processed externally by Gemini",
      "with OpenAI as a backup",
      "Use fictional data only",
      "Manual entry",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("GEMINI_API_KEY");
    // Cash facts live on Overview and inside answers, not as a fixed box in the dialog.
    expect(html).not.toContain("Calculated cash facts");
  });

  it("renders 3 page-aware starters in empty chat state", () => {
    const workspace = uiWorkspace();
    const html = renderDialog(workspace);
    expect(html).toContain('aria-label="Suggested questions"');
    expect(html).toContain("What should I do first?");
    expect(html).toContain("How much cash will we have in 30 days?");
    expect(html).toContain("Explain our first cash shortage");
  });

  it("dynamically adapts starters for forecast and invoice pages", () => {
    const forecastStarters = generatePageStarters("/forecast");
    expect(forecastStarters).toHaveLength(3);
    expect(forecastStarters[0]).toBe("Explain our first projected shortage");

    const invoicesStarters = generatePageStarters("/invoices");
    expect(invoicesStarters).toHaveLength(3);
    expect(invoicesStarters[0]).toBe("Which customer owes the most right now?");
  });

  it("includes all five required Workspace tools (+) labels", () => {
    const labels = WORKSPACE_TOOLS.map((t) => t.label);
    expect(labels).toEqual([
      "Ask about this page",
      "Draft a follow-up message",
      "Plan a follow-up task",
      "Understand a customer reply",
      "Add a record from text",
    ]);

    const html = renderDialog();
    expect(html).toContain(">Tools</button>");
    // The empty chat also offers every tool as a one-tap chip.
    for (const label of labels) expect(html).toContain('class="assistant-tool-chip">' + label + "</button>");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Workspace tools"');
  });

  it("renders composer with placeholder and send button", () => {
    const html = renderDialog();
    expect(html).toContain('placeholder="Ask about cash, invoices, or bills…');
    expect(html).toContain("Send");
  });

  it("only mounts the launcher on the initial workspace render", () => {
    const html = renderToStaticMarkup(createElement(AiAssistantLauncher, { workspace: uiWorkspace() }));
    expect(html).toContain('aria-label="Open AI assistant"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<dialog");
  });

  it("renders the exact draft customer's recipient with no save on review", () => {
    const workspace = uiWorkspace();
    const customer = { ...workspace.customers[0], id: "00000000-0000-4000-8000-000000000999", email: "invoice-b@example.test" };
    const invoice = { ...workspace.invoices[0], id: "00000000-0000-4000-8000-000000000998", customer_id: customer.id };
    workspace.customers.push(customer);
    workspace.invoices.push(invoice);
    const body = "Please check the outstanding invoice.";
    const target = resolveAssistantDraftTarget(workspace, {
      task: "chat", kind: "answer", summary: "Here is a reminder.", sourceRevision: workspace.revision,
      facts: [], sources: [], draft: { kind: "reminder", invoiceId: invoice.id, text: body },
    });
    expect(target).not.toBeNull();
    const html = renderToStaticMarkup(createElement(ReminderPanel, {
      workspace, ...target!, template: body, suggestedBody: body,
    }));
    expect(html).toContain('value="invoice-b@example.test"');
    expect(html).toContain(body);
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("gives the embedded receipt review its own heading while keeping the invoice page anchor", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(CollectionPanel, { workspace, invoice }),
      createElement(CollectionPanel, {
        workspace, invoice, proposed: { amountCents: 2_000_000, date: "2026-11-06", sourceNote: "Partial muna po." },
      }),
    ));
    const headings = [...html.matchAll(/<h2 id="([^"]+)">Expected payment<\/h2>/g)].map(match => match[1]);
    expect(new Set(headings).size).toBe(2);
    expect(html.match(/id="collection-plan"/g)).toHaveLength(1);
    for (const id of headings) expect(html).toContain('aria-labelledby="' + id + '"');
  });

  it("prefills a proposal only in the existing review form with explicit confirmation and cash impact", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(
      createElement(CollectionPanel, {
        workspace,
        invoice: workspace.invoices[0],
        proposed: { amountCents: 2_000_000, date: "2026-11-06", sourceNote: "Partial muna po." },
      })
    );
    expect(html).toContain('value="20000.00"');
    expect(html).toContain('value="2026-11-06"');
    expect(html).toContain("Partial muna po.");
    expect(html).toContain("Confirm reviewed receipt plan");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("required");
  });

  it("opens ReminderPanel for a reminder draft targeting the exact invoice without calling executeWorkspaceAction", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const draft = {
      kind: "reminder" as const,
      title: `Payment reminder for ${invoice.number}`,
      invoiceId: invoice.id,
      suggestedBody: "Hello, friendly payment reminder for DEMO-001.",
      sourceRevision: workspace.revision,
    };

    const html = renderToStaticMarkup(
      createElement(DraftReviewPanel, { draft, workspace })
    );

    expect(html).toContain(`Reviewing: Payment reminder for ${invoice.number}`);
    expect(html).toContain("Hello, friendly payment reminder for DEMO-001.");
    expect(html).toContain("Save draft");
    // Explicit save only: zero executeWorkspaceAction calls on render
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("opens FollowupForm for a followup task draft with prefilled action and date without executing action", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const draft = {
      kind: "followup" as const,
      title: `Plan next action for ${invoice.number}`,
      invoiceId: invoice.id,
      suggestedBody: "Call customer manager to follow up",
      actionDate: "2026-11-12",
      sourceRevision: workspace.revision,
    };

    const html = renderToStaticMarkup(
      createElement(DraftReviewPanel, { draft, workspace })
    );

    expect(html).toContain("Schedule follow-up task");
    expect(html).toContain(invoice.number);
    expect(html).toContain("Call customer manager to follow up");
    expect(html).toContain('value="2026-11-12"');
    expect(html).toContain("Schedule follow-up");

    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("hides the review form and alerts when draft revision is stale", () => {
    const workspace = uiWorkspace();
    workspace.revision = 5;
    const invoice = workspace.invoices[0];
    const draft = {
      kind: "reminder" as const,
      title: "Payment reminder",
      invoiceId: invoice.id,
      suggestedBody: "Stale reminder draft",
      sourceRevision: 4, // stale
    };

    const html = renderToStaticMarkup(
      createElement(DraftReviewPanel, { draft, workspace })
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("This draft was prepared for revision 4, but the workspace is now at revision 5.");
    expect(html).not.toContain("Save draft");
  });

  it("hides the form and displays error when targeted invoice does not exist", () => {
    const workspace = uiWorkspace();
    const draft = {
      kind: "reminder" as const,
      title: "Unknown invoice reminder",
      invoiceId: "nonexistent-invoice-id",
      suggestedBody: "Draft body",
      sourceRevision: workspace.revision,
    };

    const html = renderToStaticMarkup(
      createElement(DraftReviewPanel, { draft, workspace })
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("The invoice targeted by this draft is no longer available in this workspace.");
    expect(html).not.toContain("Save draft");
    expect(html).not.toContain("Schedule follow-up");
  });

  it("includes Add a record from text in WORKSPACE_TOOLS", () => {
    expect(WORKSPACE_TOOLS.some((tool) => tool.id === "add_record" && tool.label === "Add a record from text")).toBe(true);
  });

  it("handoffs an extracted invoice proposal to InvoiceForm with prefilled values without saving", () => {
    const workspace = uiWorkspace();
    const customer = workspace.customers[0];
    const initialProposed = {
      number: "INV-1042",
      customerId: customer.id,
      party: customer.name,
      amountCents: 2_500_000,
      dueDate: "2026-11-30",
    };

    const html = renderToStaticMarkup(
      createElement(InvoiceForm, { workspace, initialProposed })
    );

    expect(html).toContain('value="INV-1042"');
    expect(html).toContain(`value="${customer.id}"`);
    expect(html).toContain('value="25000.00"');
    expect(html).toContain('value="2026-11-30"');
    expect(html).toContain("Add invoice");
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("handoffs an extracted invoice proposal with an unregistered customer to CustomerForm prefilled with the proposed name", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(
      createElement(CustomerForm, {
        workspace,
        initialName: "Northbay Trading Corp",
      })
    );

    expect(html).toContain('value="Northbay Trading Corp"');
    expect(html).toContain("Add customer");
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("handoffs an extracted expense proposal to ExpenseForm with prefilled values without saving", () => {
    const workspace = uiWorkspace();
    const initialProposed = {
      label: "Office Internet",
      payee: "PLDT Enterprise",
      amountCents: 850_000,
      dueDate: "2026-11-15",
    };

    const html = renderToStaticMarkup(
      createElement(ExpenseForm, { workspace, initialProposed })
    );

    expect(html).toContain('value="Office Internet"');
    expect(html).toContain('value="PLDT Enterprise"');
    expect(html).toContain('value="8500.00"');
    expect(html).toContain('value="2026-11-15"');
    expect(html).toContain("Add expense");
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });
});
