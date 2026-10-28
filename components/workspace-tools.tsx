"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { DashboardIcon } from "./dashboard-icon";
import type { ActivityRow } from "@/lib/ui/cash-overview";
import { filterActivityRows } from "@/lib/ui/cash-overview";

export function WorkspaceTools({ rows, name, role, accountActions }: { rows: ActivityRow[]; name: string; role: string; accountActions: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const toolbar = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const closeMenus = () => toolbar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });
  useEffect(() => { toolbar.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; }); }, [pathname]);
  const results = query.trim() ? filterActivityRows(rows, "all", query).slice(0, 6) : [];
  return (
    <header ref={toolbar} className="workspace-topbar topbar" aria-label="Workspace actions" onKeyDown={(event) => { if (event.key === "Escape") { const summary = toolbar.current?.querySelector<HTMLDetailsElement>("details[open]")?.querySelector("summary"); closeMenus(); summary?.focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenus(); }}>
      <div className="workspace-tool-wrap nav-wrap">
        <div className="workspace-search search" role="search" aria-label="Find an invoice or expense" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setQuery(""); }}>
          <DashboardIcon name="search" size={17} /><input type="search" aria-label="Search invoices and expenses" placeholder="Search your records" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} />
          {query.trim() && <div className="tool-popover popover search-results"><p role="status">{results.length ? `${results.length} matching records` : "No matching unpaid records"}</p><ul>{results.map((row) => <li key={`${row.kind}-${row.id}`}><Link href={row.href} onNavigate={() => setQuery("")}><strong>{row.label}</strong><small>{row.reference} · {row.kind}</small></Link></li>)}</ul></div>}
        </div>
        <details name="workspace-toolbar" className="workspace-quick-add"><summary><DashboardIcon name="plus" size={17} /><span>Quick add</span><DashboardIcon name="chevron" size={14} /></summary><div className="tool-popover popover"><Link href="/invoices#new-invoice" onNavigate={closeMenus}><DashboardIcon name="receipt" />Add an invoice</Link><Link href="/expenses#new-expense" onNavigate={closeMenus}><DashboardIcon name="arrowOut" />Add an expense</Link><Link href="/invoices?filter=unpaid" onNavigate={closeMenus}><DashboardIcon name="arrowIn" />Record a verified receipt</Link></div></details>
        <details name="workspace-toolbar" className="workspace-review-menu"><summary aria-label="Records needing attention"><DashboardIcon name="bell" />{rows.some((row) => row.needsAttention) && <span className="review-dot" />}</summary><div className="tool-popover popover review-results"><h2>Records to review</h2>{rows.filter((row) => row.needsAttention).slice(0, 5).map((row) => <Link href={row.href} key={`${row.kind}-${row.id}`} onNavigate={closeMenus}><strong>{row.reference}</strong><small>{row.status} · {row.label}</small></Link>)}{!rows.some((row) => row.needsAttention) && <p>No entered unpaid records are flagged for review.</p>}</div></details>
        <details name="workspace-toolbar" className="workspace-profile"><summary aria-label={`Account menu for ${name}`}><span className="workspace-avatar avatar" aria-hidden="true">{name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><strong>{name}</strong><small>{role}</small></span><DashboardIcon name="chevron" size={14} /></summary><div className="tool-popover popover"><p>{name}<small>{role}</small></p>{accountActions}</div></details>
      </div>
    </header>
  );
}
