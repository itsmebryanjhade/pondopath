import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import WorkspaceLoading from "@/app/(workspace)/loading";
import WorkspaceError from "@/app/(workspace)/error";
import PageError from "@/app/error";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";

vi.mock("next/font/google", () => ({ DM_Sans: () => ({ className: "dm-sans" }) }));
const navigationState = vi.hoisted(() => ({ pathname: "/overview", pending: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => navigationState.pathname }));
vi.mock("next/link", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/link")>(),
  useLinkStatus: () => ({ pending: navigationState.pending }),
}));
vi.mock("@/app/login/actions", () => ({ signOut: async () => {} }));

const workspace = {
  actor: { role: "owner" },
  business: { name: "Fictional services", opening_date: "2026-10-29", is_demo: true },
  forecastInput: { referenceDate: "2026-10-29" },
  revision: 1,
} as WorkspaceSnapshot;

describe("persistent workspace navigation", () => {
  beforeEach(() => { navigationState.pathname = "/overview"; navigationState.pending = false; });
  it("keeps the per-page content separate from navigation and the main landmark", () => {
    const html = renderToStaticMarkup(WorkspaceShell({ workspace, children: "Current page" }));
    expect(html).toContain("Current page");
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<main");
  });

  it("loads only the content area without replacing the brand or navigation", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<main");
    expect(html).not.toContain("PondoPath");
  });

  it("keeps one main landmark and role-based controls around loading content", () => {
    const html = renderToStaticMarkup(WorkspaceFrame({ workspace, children: createElement(WorkspaceLoading) }));
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("<aside");
    expect(html).toContain("Customer invoices");
    expect(html).toContain("Invite a teammate");
    const finance = { ...workspace, actor: { ...workspace.actor, role: "finance" as const } };
    const financeHtml = renderToStaticMarkup(WorkspaceFrame({ workspace: finance, children: "Current page" }));
    expect(financeHtml).not.toContain("Invite a teammate");
    expect(financeHtml).toContain("Sign out");
  });

  it("selects the invoice tab for detail routes without selecting unrelated prefixes", () => {
    navigationState.pathname = "/invoices/demo-id";
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/invoices"/);
    navigationState.pathname = "/invoices-other";
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain('aria-current="page"');
  });

  it("announces pending navigation and clears the feedback when it settles", () => {
    navigationState.pending = true;
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html).toContain('data-pending="true"');
    expect(html).toContain("Opening Customer invoices…");
    navigationState.pending = false;
    const settled = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(settled).not.toContain('data-pending="true"');
    expect(settled).not.toContain("Opening Customer invoices…");
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
