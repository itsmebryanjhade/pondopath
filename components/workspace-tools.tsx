"use client";

import { useEffect, useRef, useState } from "react";
import type { Alerts, AlertGroupKey } from "@/lib/ui/notifications";
import { formatPHP } from "@/lib/domain/money";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardIcon } from "./dashboard-icon";
import { searchWorkspaceRecords, type ActivityRow, type WorkspaceSearchRow } from "@/lib/ui/cash-overview";
import { RefreshRecords } from "./refresh-records";
import { focusHashTarget } from "./jump-link";

export function WorkspaceTools({ rows, alerts, paidRecords, name, role, businessName, accountActions, brand, planDate }: {
  rows: ActivityRow[]; alerts: Alerts; paidRecords: WorkspaceSearchRow[]; name: string; role: string; businessName: string; planDate?: string;
  accountActions: React.ReactNode; brand: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const toolbar = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // Hidden cached routes keep their DOM; Activity cleans up this active-workspace effect.
    document.documentElement.classList.add("pondopath-workspace-document");
    return () => document.documentElement.classList.remove("pondopath-workspace-document");
  }, []);
  const closeMenus = () => toolbar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });
  useEffect(() => { toolbar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; }); }, [pathname]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbar.current?.contains(event.target)) {
        toolbar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });
        setMobileSearchOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => { if (mobileSearchOpen) searchInput.current?.focus(); }, [mobileSearchOpen]);
  const { results, direct } = searchWorkspaceRecords([...rows, ...paidRecords], query);
  const dismissResults = () => { setQuery(""); setMobileSearchOpen(false); };
  const jumpToCurrentBill = (href: string) => {
    const [path, id] = href.split("#");
    const current = window.location;
    if (!id?.startsWith("expense-") || path.split("?")[0] !== current.pathname || !focusHashTarget(id)) return false;
    if (href !== `${current.pathname}${current.search}${current.hash}`) window.history.pushState(null, "", href);
    return true;
  };
  const ALERT_ICON: Record<AlertGroupKey, "arrowOut" | "arrowIn" | "bell" | "receipt"> = { bills: "arrowOut", collect: "arrowIn", followups: "bell", review: "receipt" };
  const summary = [
    alerts.overdueBillCents > 0 ? `${formatPHP(alerts.overdueBillCents)} in bills overdue` : "",
    alerts.overdueOwedCents > 0 ? `${formatPHP(alerts.overdueOwedCents)} overdue from customers` : "",
  ].filter(Boolean).join(" · ");
  const dismissSearch = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) { setMobileSearchOpen(false); setQuery(""); }
  };
  return (
    <header ref={toolbar} className="topbar" aria-label="Workspace actions" onKeyDown={(event) => {
      if (event.key === "Escape") {
        const summary = toolbar.current?.querySelector<HTMLDetailsElement>("details[open]")?.querySelector("summary");
        closeMenus();
        summary?.focus();
        if (mobileSearchOpen) { setMobileSearchOpen(false); searchToggle.current?.focus(); }
        setQuery("");
      }
    }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { closeMenus(); setMobileSearchOpen(false); } }}>
      <div className="nav-wrap">
        <div className="mobile-brand">{brand}</div>
        <div className="nav-actions">
        {planDate && <div className="topbar-plan">
          <span className="topbar-date" title="Plan date, Philippine time"><DashboardIcon name="calendar" size={15} />{planDate} · PHT</span>
          <RefreshRecords compact />
        </div>}
        <button ref={searchToggle} type="button" className="icon-button mobile-search-toggle" aria-label="Search records" aria-controls="workspace-record-search" aria-expanded={mobileSearchOpen} onClick={() => { closeMenus(); setMobileSearchOpen(!mobileSearchOpen); }}><DashboardIcon name="search" size={17} /></button>
        <form id="workspace-record-search" className={`workspace-search search${mobileSearchOpen ? " mobile-search-open" : ""}`} role="search" aria-label="Find an invoice or expense"
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setQuery(""); }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!direct) return;
            dismissResults();
            if (!jumpToCurrentBill(direct.href)) router.push(direct.href);
          }}
        >
          <DashboardIcon name="search" size={17} /><input ref={searchInput} type="search" aria-label="Search invoices and expenses" placeholder="Invoice #, customer, or bill" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query.trim() && <div className="popover search-results">
            <p role="status">{direct ? "Press Enter to open" : results.length ? "Matching records" : "No matching invoices or bills"}</p>
            <ul>{results.map((row) => <li key={`${row.kind}-${row.id}`}>
              <Link href={row.href} onNavigate={(event) => {
                if (jumpToCurrentBill(row.href)) event.preventDefault();
                dismissResults();
              }}>
                <strong>{row.kind === "invoice" ? row.reference : row.label}</strong>
                <small>{row.kind === "invoice" ? row.label : row.reference} · {row.status}</small>
              </Link>
            </li>)}</ul>
          </div>}
        </form>
        <details name="workspace-toolbar" className="notification-wrap" onToggle={dismissSearch}>
          <summary className={`icon-button notification${alerts.count ? (alerts.urgent ? " has-urgent" : " has-alerts") : ""}`} aria-label={alerts.count ? `${alerts.count} ${alerts.count === 1 ? "thing needs" : "things need"} your attention` : "Notifications: nothing needs your attention"}>
            <DashboardIcon name="bell" />{alerts.count > 0 && <span className="notification-count" aria-hidden="true">{alerts.count > 9 ? "9+" : alerts.count}</span>}
          </summary>
          <div className="popover notification-panel">
            <div className="notification-head">
              <strong>{alerts.count ? "Needs your attention" : "Notifications"}</strong>
              {summary && <small>{summary}</small>}
            </div>
            {alerts.groups.map((group) => (
              <section key={group.key} className={`notification-group is-${group.key}`} aria-label={group.label}>
                <div className="notification-group-head"><span>{group.label}</span>{group.items.length > 3 && <Link href={group.href} onNavigate={closeMenus}>See all {group.items.length}</Link>}</div>
                {group.items.slice(0, 3).map((item) => (
                  <Link className={`notification-item${item.late ? " is-late" : ""}`} href={item.href} key={`${group.key}-${item.id}`} onNavigate={closeMenus}>
                    <span className="notification-icon" aria-hidden="true"><DashboardIcon name={ALERT_ICON[group.key]} size={15} /></span>
                    <span className="notification-copy"><strong>{item.title}</strong><small>{item.detail}{item.when ? <> · <span className="notification-when">{item.when}</span></> : null}</small></span>
                    {item.amountCents !== undefined && <span className="notification-amount num">{formatPHP(item.amountCents)}</span>}
                  </Link>
                ))}
              </section>
            ))}
            {!alerts.count && <p className="notification-empty"><span aria-hidden="true"><DashboardIcon name="check" size={16} /></span>You&rsquo;re all caught up.</p>}
          </div>
        </details>
        <details name="workspace-toolbar" className="profile-wrap" onToggle={dismissSearch}>
          <summary className="profile" aria-label={`Account menu for ${name}`}><span className="avatar" aria-hidden="true">{name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="profile-copy"><strong>{name}</strong><small>{role}</small></span><DashboardIcon name="chevron" size={15} /></summary>
          <div className="popover profile-menu"><div><strong>{name}</strong><span>{role} · {businessName}</span></div>{accountActions}</div>
        </details>
        </div>
      </div>
    </header>
  );
}
