import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import InvoiceDetail from "@/app/(workspace)/invoices/[id]/page";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const readers = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getCashMovements: vi.fn(),
  getRecordHistory: vi.fn(),
}));
vi.mock("@/lib/server/workspace", () => readers);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));

async function render(searchParams: { from?: string | string[]; movement?: string }) {
  const workspace = uiWorkspace();
  readers.getWorkspace.mockResolvedValue(workspace);
  readers.getCashMovements.mockResolvedValue([]);
  readers.getRecordHistory.mockResolvedValue({ events: [], nextCursor: null });
  return renderToStaticMarkup(await InvoiceDetail({
    params: Promise.resolve({ id: workspace.invoices[0].id }),
    searchParams: Promise.resolve(searchParams),
  }));
}

describe("invoice return link", () => {
  it.each([
    ["forecast", "/forecast", "Back to forecast"],
    ["followups", "/followups", "Back to follow-ups"],
    ["overview", "/overview#cash-activity", "Back to overview"],
    ["review", "/imports?state=resolved", "Back to review"],
  ])("returns to %s", async (from, href, label) => {
    expect(await render({ from })).toContain(`class="back-link invoice-back" href="${href}">← ${label}</a>`);
  });

  it.each([undefined, "/team", "//example.test", "constructor", ["forecast", "overview"]])(
    "falls back to the invoice list for %j",
    async (from) => {
      expect(await render({ from })).toContain('class="back-link invoice-back" href="/invoices">← All invoices</a>');
    },
  );

  it("keeps a selected receipt focusable with the ordinary invoice back link", async () => {
    const workspace = uiWorkspace();
    const movement = "80000000-0000-4000-8000-000000000001";
    readers.getCashMovements.mockResolvedValueOnce([{
      id: movement, amount_cents: 10_000, payment_date: "2026-10-30", recorded_by: workspace.actor.userId,
      created_at: "2026-10-30T01:00:00Z", voided_at: null,
    }]);
    const html = await render({ movement });
    expect(readers.getCashMovements).toHaveBeenCalledWith("receipt", workspace.revision, workspace.invoices[0].id, movement);
    expect(html).toContain("Selected payment");
    expect(html).toContain(`id="movement-${movement}" tabindex="-1"`);
    expect(html).toContain('class="back-link invoice-back" href="/invoices">← All invoices</a>');
  });
});
