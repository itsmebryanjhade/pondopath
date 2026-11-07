import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceFrame } from "@/components/workspace-frame";
import WorkspaceLayout from "@/app/(workspace)/layout";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
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
    for (const className of ["app-shell", "side-nav", "nav-wrap", "nav-actions", "mobile-brand", "mobile-nav", "quick-button", "notification-panel", "profile-menu"]) expect(html).toContain(className);
    expect(html).not.toContain('class="mobile-header"');
    expect(html).toContain('aria-label="Search records"');
    expect(html).toContain(workspace.business.name);
  });

  it("uses actual open follow-up totals and keeps mobile routes available", () => {
    navigationState.pathname = "/followups";
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { mobile: true, followupCount: 2 }));
    expect(html).toContain('aria-label="2 open follow-ups"');
    expect(html.match(/href="\/(overview|cash|invoices|expenses|forecast)"/g)).toHaveLength(5);
    expect(html).not.toContain('href="/followups"');
    expect(html).not.toContain('href="/payments"');
    expect(html).toMatch(/class="mobile-tab active"[^>]*aria-current="page"[^>]*href="\/invoices"/);
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain('class="side-count"');
  });

  it("selects the invoice tab for detail routes without selecting unrelated prefixes", () => {
    navigationState.pathname = "/invoices/demo-id";
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/invoices"/);
    navigationState.pathname = "/invoices-other";
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain('aria-current="page"');
  });

  it.each([["/cash", "/cash"], ["/payments", "/cash"], ["/forecast", "/forecast"], ["/followups", "/invoices"], ["/imports", "/invoices"], ["/add", "/invoices"]])("selects the parent tab for %s", (pathname, destination) => {
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
});
