"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { AppIcon } from "./app-icon";
import { DashboardIcon } from "./dashboard-icon";
import { SideIconGlyph } from "./side-icons";
import { activeHref, sidebarGroups } from "@/lib/ui/sidebar";

const destinations = [
  { href: "/overview", label: "Overview", icon: "sparkle" },
  { href: "/cash", label: "Cash", icon: "wallet" },
  { href: "/invoices", label: "Invoices", icon: "receipt" },
  { href: "/expenses", label: "Expenses", icon: "arrowOut" },
  { href: "/forecast", label: "Forecast", icon: "calendar" },
] as const;

function NavigationFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span className="sr-only" role="status" data-pending={pending}>{pending ? `Opening ${label}…` : ""}</span>;
}

export function WorkspaceNavigation({ mobile = false, followupCount = 0, inboxCount = 0 }: { mobile?: boolean; followupCount?: number; inboxCount?: number }) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  if (mobile) {
    // The phone strip keeps the five main pages; a bottom bar replaces it in a later piece.
    const activeMobile = pathname === "/payments" ? "/cash" : ["/followups", "/imports", "/add"].includes(pathname) ? "/invoices" : pathname;
    return (
      <nav ref={navigation} aria-label="Mobile cash planning" className="mobile-nav">
        <ul>{destinations.map((item) => (
          <li key={item.href}>
            <Link href={item.href}
              className={`mobile-tab${activeMobile === item.href || activeMobile.startsWith(`${item.href}/`) ? " active" : ""}`}
              aria-current={activeMobile === item.href || activeMobile.startsWith(`${item.href}/`) ? "page" : undefined}
              onNavigate={() => navigation.current?.closest("details")?.removeAttribute("open")}>
              <span>{item.label}</span>
              {item.href === "/invoices" && followupCount > 0 && <span className="side-count" aria-label={`${followupCount} open follow-ups`}>{followupCount}</span>}
              <NavigationFeedback label={item.label} />
            </Link>
          </li>
        ))}</ul>
      </nav>
    );
  }
  const current = activeHref(pathname);
  return (
    <nav ref={navigation} aria-label="Cash planning">
      <Link href="/add" className={`side-add${current === "/add" ? " active" : ""}`} data-tip="Add records" aria-current={current === "/add" ? "page" : undefined}>
        <span className="side-add-icon"><DashboardIcon name="plus" size={17} /></span><span className="side-label">Add records</span>
        <NavigationFeedback label="Add records" />
      </Link>
      {sidebarGroups({ inbox: inboxCount, followups: followupCount }).map((group) => (
        <div className="side-group" key={group.title}>
          <p className="side-group-title">{group.title}</p>
          <ul>{group.items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={`side-link${current === item.href ? " active" : ""}`}
                data-tip={item.countLabel ? `${item.label}, ${item.countLabel}` : item.label}
                aria-current={current === item.href ? "page" : undefined}>
                <span className="side-link-icon"><SideIconGlyph name={item.icon} size={17} /></span>
                <span className="side-label">{item.label}</span>
                {item.count && <span className={`side-count${item.href === "/followups" ? " urgent" : ""}`} aria-label={item.countLabel}>{item.count}</span>}
                <NavigationFeedback label={item.label} />
              </Link>
            </li>
          ))}</ul>
        </div>
      ))}
    </nav>
  );
}

export function WorkspaceInvitationLink() {
  const link = useRef<HTMLAnchorElement>(null);
  return <Link ref={link} href="/team" className="account-action"
    onNavigate={() => link.current?.closest("details")?.removeAttribute("open")}>
    <AppIcon name="users" />Invite a teammate
  </Link>;
}
