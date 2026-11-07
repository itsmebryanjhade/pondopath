import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceFrame } from "@/components/workspace-frame";
import WorkspaceLayout from "@/app/(workspace)/layout";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import WorkspaceLoading from "@/components/workspace-loading";
import WorkspaceError from "@/app/(workspace)/error";
import PageError from "@/app/error";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";

vi.mock("next/font/google", () => ({ DM_Sans: () => ({ className: "dm-sans" }), Manrope: () => ({ variable: "manrope" }) }));
const navigationState = vi.hoisted(() => ({ pathname: "/overview", pending: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => navigationState.pathname }));
vi.mock("next/link", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/link")>(),
  useLinkStatus: () => ({ pending: navigationState.pending }),
}));
vi.mock("@/app/login/actions", () => ({ signOut: async () => {} }));
vi.mock("@/lib/server/workspace", () => ({ getWorkspace: () => new Promise(() => {}) }));
vi.mock("@/components/ai-assistant", () => ({ AiAssistant: () => createElement("button", null, "AI assistant") }));

const workspace: WorkspaceSnapshot = {
  actor: { role: "owner", userId: "owner-1", businessId: "business-1" },
  business: { id: "business-1", name: "Fictional services", opening_date: "2026-10-29", opening_cash_cents: 0, opening_locked_at: null, is_demo: true, ai_daily_limit: 1, created_at: "2026-10-29T00:00:00Z", currency: "PHP", demo_reference_date: "2026-10-29", revision: 1 },
  forecastInput: { referenceDate: "2026-10-29", availableCents: 0, invoices: [], expenses: [] },
  members: [], invoices: [], expenses: [], customers: [],
  expectations: [], followups: [], reminders: [], automation: { stale: false, lastSuccessAt: null },
  revision: 1,
};

describe("persistent workspace navigation", () => {
  beforeEach(() => { navigationState.pathname = "/overview"; navigationState.pending = false; });
  it("keeps the per-page content separate from navigation and the main landmark", () => {
    const html = renderToStaticMarkup(WorkspaceShell({ workspace, children: "Current page" }));
    expect(html).toContain("Current page");
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<main");
    expect(html).toContain('class="page-enter"');
  });

  it("loads only the content area without replacing the brand or navigation", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="sr-only" role="status"');
    expect(html).toContain('class="skeleton-feature"');
    expect(html.match(/class="skeleton-metric"/g)).toHaveLength(3);
    expect(html).toContain("workspace-slow-splash");
    expect(html).not.toContain("<h1>");
    expect(html).not.toContain("<main");
  });

  it("shows a branded splash during the initial authenticated load", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, null, "Workspace data"));
    expect(html).toContain("first-paint-splash");
    expect(html).toContain('class="first-paint-splash" aria-hidden="true"');
    expect(html.match(/<main\b/g)).toHaveLength(2);
    expect(html).toContain("PondoPath");
    expect(html).toContain("Preparing your cash plan");
    expect(html).toContain("workspace-splash-mark");
    expect(html).toContain("workspace-splash-name");
    expect(html).not.toContain("workspace-splash-eyebrow");
    expect(html).not.toContain("workspace-splash-steps");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("workspace-splash-card");
    expect(html).toContain("Still loading your workspace");
    expect(html).not.toContain("skeleton-feature");
    expect(html).toContain('role="status"');
  });

  it("keeps one main landmark and role-based controls around loading content", () => {
    const html = renderToStaticMarkup(WorkspaceFrame({ workspace, children: createElement(WorkspaceLoading) }));
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("<aside");
    expect(html).toContain("Invoices");
    expect(html).toContain("Invite a teammate");
    const finance = { ...workspace, actor: { ...workspace.actor, role: "finance" as const } };
    const financeHtml = renderToStaticMarkup(WorkspaceFrame({ workspace: finance, children: "Current page" }));
    expect(financeHtml).not.toContain("Invite a teammate");
    expect(financeHtml).toContain("Sign out");
  });

  it("reuses the source shell with in-bar mobile branding and no second mobile header", () => {
    const html = renderToStaticMarkup(WorkspaceFrame({ workspace, children: "Current page" }));
    for (const className of ["app-shell", "side-nav", "nav-wrap", "nav-actions", "mobile-brand", "mobile-bar", "notification-panel", "profile-menu"]) expect(html).toContain(className);
    expect(html).not.toContain('class="mobile-header"');
    // One add action: the header no longer repeats the sidebar's and the phone bar's plus button.
    expect(html).not.toContain("Quick add");
    expect(html).not.toContain("quick-menu");
    // The header says what it really searches and sends flagged records to the matching list.
    expect(html).toContain('placeholder="Search unpaid records"');
    expect(html).toMatch(/href="\/overview#needs-attention"[^>]*>View flagged records/);
    expect(html).toContain('aria-label="Search records"');
    expect(html).toContain(workspace.business.name);
  });


  it("selects the invoice tab for detail routes without selecting unrelated prefixes", () => {
    navigationState.pathname = "/invoices/demo-id";
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/invoices"/);
    navigationState.pathname = "/invoices-other";
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain('aria-current="page"');
  });

  it.each([["/cash", "/cash"], ["/payments", "/cash"], ["/forecast", "/forecast"], ["/followups", "/followups"], ["/imports", "/imports"], ["/add", "/add"]])("selects the matching sidebar item for %s", (pathname, destination) => {
    navigationState.pathname = pathname;
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    const selected = html.match(/<a[^>]*aria-current="page"[^>]*>/g);
    expect(selected).toHaveLength(1);
    expect(selected![0]).toContain(`href="${destination}"`);
  });

  it("announces pending navigation without replacing its icons with spinning circles", () => {
    navigationState.pending = true;
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html).toContain('data-pending="true"');
    expect(html).toContain("Opening Invoices…");
    expect(html).not.toContain('class="nav-pending"');
    expect(html).not.toContain("refresh-cw.svg");
    navigationState.pending = false;
    const settled = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(settled).not.toContain('data-pending="true"');
    expect(settled).not.toContain("Opening Invoices…");
  });

  it("retries a failed server load with fresh records through both error boundaries", () => {
    const retry = vi.fn();
    const errorView = WorkspaceError({ retry });
    const button = errorView.props.children.find((child: { type: unknown }) => child.type === "button");
    expect(button.props.onClick).toBe(retry);
    button.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
    const pageError = PageError({ retry });
    expect(pageError.props.children.props.retry).toBe(retry);
  });

  it("groups the sidebar, puts Add records on top and shows counts with full-phrase labels", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { followupCount: 2, inboxCount: 3 }));
    expect(html).toMatch(/<a[^>]*href="\/add"[^>]*>[\s\S]*?Add records/);
    for (const title of ["Plan", "Money", "To do"]) expect(html).toContain(title);
    for (const label of ["Overview", "Forecast", "Cash ledger", "Invoices", "Expenses", "Review imports", "Follow-ups"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="3 waiting for review"');
    expect(html).toContain('aria-label="2 open follow-ups"');
    expect(html).not.toContain("Team");
  });
  it("keeps every item's name in the page even when the rail is collapsed, and tooltips use it", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { inboxCount: 1 }));
    expect(html).toContain('data-tip="Review imports, 1 waiting for review"');
    expect(html).toContain('data-tip="Overview"');
    expect(html).toContain('class="side-label"');
  });
  it("renders no badges when nothing is waiting", () => {
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain("side-count");
  });
  it("offers a labelled collapse button that reports its state", () => {
    const html = renderToStaticMarkup(WorkspaceFrame({ workspace, children: "Current page" }));
    expect(html).toMatch(/<button[^>]*aria-label="Collapse sidebar"[^>]*aria-expanded="true"/);
    expect(html).not.toContain("Forecast check");
  });

  it("the phone bar has five spots with Add in the centre and counts as full phrases", () => {
    navigationState.pathname = "/overview";
    const html = renderToStaticMarkup(createElement(MobileTabBar, { followupCount: 2, inboxCount: 3 }));
    expect(html).toContain('aria-label="Main menu"');
    for (const label of ["Overview", "Review", "Add", "Follow-ups", "More"]) expect(html).toContain(`>${label}</span>`);
    expect(html).toMatch(/<a[^>]*class="[^"]*mobile-fab[^"]*"[^>]*href="\/add"|<a[^>]*href="\/add"[^>]*class="[^"]*mobile-fab/);
    expect(html).toContain('aria-label="3 waiting for review"');
    expect(html).toContain('aria-label="2 open follow-ups"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/overview"|<a[^>]*href="\/overview"[^>]*aria-current="page"/);
  });
  it("the More sheet is closed on first render and its button reports that", () => {
    navigationState.pathname = "/overview";
    const html = renderToStaticMarkup(createElement(MobileTabBar, { followupCount: 0, inboxCount: 0 }));
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="more-sheet"|<button[^>]*aria-controls="more-sheet"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('id="more-sheet"');
    expect(html).not.toContain("side-count");
  });
  it("More is marked current on pages inside it, and the bar has no other current item", () => {
    navigationState.pathname = "/forecast";
    const html = renderToStaticMarkup(createElement(MobileTabBar, { followupCount: 1, inboxCount: 0 }));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/mobile-tab more active/);
    navigationState.pathname = "/followups";
    const followups = renderToStaticMarkup(createElement(MobileTabBar, { followupCount: 1, inboxCount: 0 }));
    expect(followups).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/followups"|<a[^>]*href="\/followups"[^>]*aria-current="page"/);
  });
});
