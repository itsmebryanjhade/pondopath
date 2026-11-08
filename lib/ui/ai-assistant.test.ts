import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiAssistant, WORKSPACE_TOOLS } from "@/components/ai-assistant";
import { CollectionPanel } from "@/components/collection-panel";
import { generatePageStarters, generateMockReply } from "./assistant-chat-adapter";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/(workspace)/actions", () => ({
  executeWorkspaceAction: vi.fn(),
  getApprovedReminderText: vi.fn(),
}));

describe("multilingual assistant presentation & Task 4 conversation UI", () => {
  it("has a named native dialog, language choices, New chat button, privacy notice and manual fallback", () => {
    const html = renderToStaticMarkup(createElement(AiAssistant, { workspace: uiWorkspace() }));
    for (const text of [
      "<dialog",
      "aria-labelledby",
      "Close AI assistant",
      "New chat",
      "Match my language",
      "Tagalog",
      "Taglish",
      "processed externally by Gemini",
      "Use fictional data only",
      "Manual entry",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("OPENROUTER_API_KEY");
    expect(html).not.toContain("GEMINI_API_KEY");
    expect(html).toContain("Calculated cash facts");
    expect(html).toContain("Recorded available cash");
    expect(html).toContain("₱40,000.00");
  });

  it("renders 3 page-aware starters in empty chat state", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(createElement(AiAssistant, { workspace }));
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

    const html = renderToStaticMarkup(createElement(AiAssistant, { workspace: uiWorkspace() }));
    expect(html).toContain("+ Workspace tools");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Workspace tools"');
  });

  it("renders composer with placeholder and send button", () => {
    const html = renderToStaticMarkup(createElement(AiAssistant, { workspace: uiWorkspace() }));
    expect(html).toContain('placeholder="Ask about cash, invoices, or bills…');
    expect(html).toContain("Send");
  });

  it("generates mocked chat responses with verified facts and safe source links", () => {
    const workspace = uiWorkspace();
    const reply = generateMockReply("Why is cash dipping?", workspace);
    expect(reply.text).toBeDefined();
    expect(reply.facts?.length).toBeGreaterThan(0);
    expect(reply.sources?.length).toBeGreaterThan(0);
    expect(reply.sources?.[0].href).toMatch(/^\/invoices\//);
  });

  it("generates reviewable draft reminder with safe invoice link and source revision", () => {
    const workspace = uiWorkspace();
    const reply = generateMockReply("Draft a reminder for DEMO-001", workspace);
    expect(reply.draft?.kind).toBe("reminder");
    expect(reply.draft?.title).toContain("Payment reminder");
    expect(reply.draft?.suggestedBody).toContain("DEMO-001");
    expect(reply.draft?.sourceRevision).toBe(workspace.revision);
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
});
