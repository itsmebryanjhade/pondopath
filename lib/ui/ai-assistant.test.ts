import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiAssistant } from "@/components/ai-assistant";
import { CollectionPanel } from "@/components/collection-panel";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";
vi.mock("next/navigation", () => ({ usePathname: () => "/overview", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn(), getApprovedReminderText: vi.fn() }));
describe("multilingual assistant presentation", () => {
  it("has a named native dialog, language choices, privacy notice and manual fallback", () => {
    const html = renderToStaticMarkup(createElement(AiAssistant, { workspace: uiWorkspace() }));
    for (const text of ["<dialog", "aria-labelledby", "Close AI assistant", "Tagalog", "Taglish", "processed externally", "Manual entry"]) expect(html).toContain(text);
    expect(html).not.toContain("OPENROUTER_API_KEY");
    expect(html).toContain("Calculated cash facts");
    expect(html).toContain("Recorded available cash");
    expect(html).toContain("₱40,000.00");
  });
  it("prefills a proposal only in the existing review form with explicit confirmation and cash impact", () => {
    const workspace = uiWorkspace();
    const html = renderToStaticMarkup(createElement(CollectionPanel, { workspace, invoice: workspace.invoices[0], proposed: { amountCents: 2_000_000, date: "2026-11-06", sourceNote: "Partial muna po." } }));
    expect(html).toContain('value="20000.00"');
    expect(html).toContain('value="2026-11-06"');
    expect(html).toContain("Partial muna po.");
    expect(html).toContain("Confirm reviewed receipt plan");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("required");
  });
});
