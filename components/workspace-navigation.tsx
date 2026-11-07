"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { AppIcon } from "./app-icon";
import { DashboardIcon } from "./dashboard-icon";

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

export function WorkspaceNavigation({ mobile = false, followupCount = 0 }: { mobile?: boolean; followupCount?: number }) {
  const pathname = usePathname();
  const activeHref = pathname === "/payments" ? "/cash" : ["/followups", "/imports", "/add"].includes(pathname) ? "/invoices" : pathname;
  const navigation = useRef<HTMLElement>(null);
  return (
    <nav ref={navigation} aria-label={mobile ? "Mobile cash planning" : "Cash planning"} className={mobile ? "mobile-nav" : undefined}>
      <ul>{destinations.map((item) => (
        <li key={item.href}>
          <Link href={item.href}
            className={`${mobile ? "mobile-tab" : "side-link"}${activeHref === item.href || activeHref.startsWith(`${item.href}/`) ? " active" : ""}`}
            aria-current={activeHref === item.href || activeHref.startsWith(`${item.href}/`) ? "page" : undefined}
            onNavigate={() => navigation.current?.closest("details")?.removeAttribute("open")}>
            {!mobile && <span className="side-link-icon"><DashboardIcon name={item.icon} size={17} /></span>}<span>{item.label}</span>
            {item.href === "/invoices" && followupCount > 0 && <span className="side-count" aria-label={`${followupCount} open follow-ups`}>{followupCount}</span>}
            <NavigationFeedback label={item.label} />
          </Link>
        </li>
      ))}</ul>
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
