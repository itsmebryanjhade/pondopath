"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { DashboardIcon } from "./dashboard-icon";
import type { ActivityRow } from "@/lib/ui/cash-overview";
import { filterActivityRows } from "@/lib/ui/cash-overview";

export function WorkspaceTools({ rows, name, role, businessName, accountActions, brand }: {
  rows: ActivityRow[]; name: string; role: string; businessName: string;
  accountActions: React.ReactNode; brand: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const toolbar = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
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
  const results = query.trim() ? filterActivityRows(rows, "all", query).slice(0, 6) : [];
  const flagged = rows.filter((row) => row.needsAttention);
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
        <button ref={searchToggle} type="button" className="icon-button mobile-search-toggle" aria-label="Search records" aria-controls="workspace-record-search" aria-expanded={mobileSearchOpen} onClick={() => { closeMenus(); setMobileSearchOpen(!mobileSearchOpen); }}><DashboardIcon name="search" size={17} /></button>
        <div id="workspace-record-search" className={`workspace-search search${mobileSearchOpen ? " mobile-search-open" : ""}`} role="search" aria-label="Find an invoice or expense" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setQuery(""); }}>
          <DashboardIcon name="search" size={17} /><input ref={searchInput} type="search" aria-label="Search invoices and expenses" placeholder="Search your records" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query.trim() && <div className="popover search-results"><p role="status">{results.length ? `${results.length} matching records` : "No matching unpaid records"}</p><ul>{results.map((row) => <li key={`${row.kind}-${row.id}`}><Link href={row.href} onNavigate={() => { setQuery(""); setMobileSearchOpen(false); }}><strong>{row.label}</strong><small>{row.reference} · {row.kind}</small></Link></li>)}</ul></div>}
        </div>
        <details name="workspace-toolbar" className="notification-wrap" onToggle={dismissSearch}>
          <summary className="icon-button notification" aria-label="Records needing attention"><DashboardIcon name="bell" />{flagged.length > 0 && <span />}</summary>
          <div className="popover notification-panel">
            <div className="notification-head"><strong>Records to review</strong><Link href="/followups" onNavigate={closeMenus}>View follow-ups</Link></div>
            {flagged.slice(0, 5).map((row) => <Link className="notification-item" href={row.href} key={`${row.kind}-${row.id}`} onNavigate={closeMenus}><span className="notification-icon warning"><DashboardIcon name="alert" size={15} /></span><span><strong>{row.reference} · {row.status}</strong><small>{row.label}</small></span><DashboardIcon name="arrowRight" size={14} /></Link>)}
            {!flagged.length && <p className="toolbar-empty">No entered unpaid records are flagged for review.</p>}
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
