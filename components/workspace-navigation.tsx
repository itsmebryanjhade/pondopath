"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { AppIcon } from "./app-icon";

const destinations = [
  { href: "/overview", label: "Cash overview", icon: "bar-chart-2" },
  { href: "/invoices", label: "Customer invoices", icon: "file-text" },
  { href: "/expenses", label: "Expenses & payments", icon: "credit-card" },
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
            <AppIcon name={item.icon} /><span>{item.label}</span>
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
