import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/overview" }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ ensureFileSourceAction: vi.fn(), inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn() }));
import { FileDropOverlay, nextDragDepth } from "@/components/file-drop-overlay";

describe("drop a file anywhere", () => {
  it("the overlay is hidden until a file drag starts", () => {
    expect(renderToStaticMarkup(createElement(FileDropOverlay))).not.toContain("Drop to import");
  });
  it("counts nested drag enters and leaves so leaving the window hides the overlay", () => {
    expect(nextDragDepth(0, "enter")).toBe(1);
    expect(nextDragDepth(1, "enter")).toBe(2);
    expect(nextDragDepth(2, "leave")).toBe(1);
    expect(nextDragDepth(1, "leave")).toBe(0);
    expect(nextDragDepth(0, "leave")).toBe(0);
    expect(nextDragDepth(3, "drop")).toBe(0);
  });
});
