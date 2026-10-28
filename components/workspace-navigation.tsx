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
  { href: "/payments", label: "Payments", icon: "arrowIn" },
  { href: "/expenses", label: "Expenses", icon: "arrowOut" },
  { href: "/forecast", label: "Forecast", icon: "calendar" },
  { href: "/followups", label: "Follow-ups", icon: "bell" },
] as const;

function NavigationFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span className="nav-pending" data-pending={pending} aria-hidden="true"><AppIcon name="refresh-cw" /></span>
    <span className="sr-only" role="status">{pending ? `Opening ${label}…` : ""}</span>
  </>;
}

export function WorkspaceNavigation() {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  return (
    <nav ref={navigation} aria-label="Cash planning">
      <ul>{destinations.map((item) => (
        <li key={item.href}>
          <Link href={item.href}
            aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
            onNavigate={() => navigation.current?.closest("details")?.removeAttribute("open")}>
            <span className="side-link-icon"><DashboardIcon name={item.icon} size={17} /></span><span>{item.label}</span>
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
