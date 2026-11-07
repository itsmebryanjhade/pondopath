/** Sidebar structure: real workspace pages only, grouped by what a person is doing. */
export type SideIcon = "sparkle" | "calendar" | "wallet" | "receipt" | "arrowOut" | "inbox" | "message" | "plus" | "more";
export type SideItem = { href: string; label: string; icon: SideIcon; count?: string; countLabel?: string };
export type SideGroup = { title: string; items: SideItem[] };

export const SIDEBAR_KEY = "pondopath-sidebar-collapsed";
const INBOX_CAP = 20;

export const badgeText = (count: number) => (count <= 0 ? "" : count >= INBOX_CAP ? `${INBOX_CAP}+` : String(count));

export function countPhrase(href: "/imports" | "/followups", count: number): string {
  if (href === "/imports") return count >= INBOX_CAP ? `${INBOX_CAP} or more waiting for review` : `${count} waiting for review`;
  return `${count} open follow-up${count === 1 ? "" : "s"}`;
}

export function sidebarGroups(counts: { inbox: number; followups: number }): SideGroup[] {
  const counted = (href: "/imports" | "/followups", n: number) => (n > 0 ? { count: badgeText(n), countLabel: countPhrase(href, n) } : {});
  return [
    { title: "Plan", items: [
      { href: "/overview", label: "Overview", icon: "sparkle" },
      { href: "/forecast", label: "Forecast", icon: "calendar" },
    ] },
    { title: "Money", items: [
      { href: "/cash", label: "Cash ledger", icon: "wallet" },
      { href: "/invoices", label: "Invoices", icon: "receipt" },
      { href: "/expenses", label: "Expenses", icon: "arrowOut" },
    ] },
    { title: "To do", items: [
      { href: "/imports", label: "Review imports", icon: "inbox", ...counted("/imports", counts.inbox) },
      { href: "/followups", label: "Follow-ups", icon: "message", ...counted("/followups", counts.followups) },
    ] },
  ];
}

const PAGES = ["/overview", "/forecast", "/cash", "/invoices", "/expenses", "/imports", "/followups", "/add"];

/** The sidebar entry for a path: payments live under Cash, detail pages under their list. Unknown paths highlight nothing. */
export function activeHref(pathname: string): string {
  if (pathname === "/payments") return "/cash";
  return PAGES.find((href) => pathname === href || pathname.startsWith(`${href}/`)) ?? "";
}

export const parseCollapsed = (raw: string | null) => raw === "1";

export type MobileTab =
  | { kind: "link"; href: string; label: string; icon: SideIcon; fab?: boolean; count?: string; countLabel?: string }
  | { kind: "more"; label: "More"; icon: SideIcon; count?: string; countLabel?: string };

/** Phone bottom bar: five spots, Add in the centre; every count sits on its own labelled tab. */
export function mobileTabs(counts: { inbox: number; followups: number }): MobileTab[] {
  const [review, followups] = sidebarGroups(counts)[2].items;
  const counted = (item: SideItem) => (item.count ? { count: item.count, countLabel: item.countLabel } : {});
  return [
    { kind: "link", href: "/overview", label: "Overview", icon: "sparkle" },
    { kind: "link", href: "/imports", label: "Review", icon: "inbox", ...counted(review) },
    { kind: "link", href: "/add", label: "Add", icon: "plus", fab: true },
    { kind: "link", href: "/followups", label: "Follow-ups", icon: "message", ...counted(followups) },
    { kind: "more", label: "More", icon: "more" },
  ];
}

const MORE_HREFS = ["/forecast", "/cash", "/invoices", "/expenses"];

/** The pages that live behind More, in sidebar order. */
export function moreItems(counts: { inbox: number; followups: number }): SideItem[] {
  return sidebarGroups(counts).flatMap((group) => group.items).filter((item) => MORE_HREFS.includes(item.href));
}

export const moreActive = (pathname: string) => MORE_HREFS.includes(activeHref(pathname));
