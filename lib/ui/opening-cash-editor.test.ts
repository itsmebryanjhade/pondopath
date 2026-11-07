import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));
import { OpeningCashEditor } from "@/components/opening-cash-editor";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

describe("opening cash editor", () => {
  it("starts as one Edit button, with no form until the owner asks for it", () => {
    const html = renderToStaticMarkup(createElement(OpeningCashEditor, { workspace: uiWorkspace() }));
    expect(html).toContain("Edit opening cash");
    expect(html).not.toContain("<form");
  });
});
