"use client";

import { useEffect, useState } from "react";
import { SIDEBAR_KEY, parseCollapsed } from "@/lib/ui/sidebar";

/** Collapses the sidebar to an icon rail. The choice is remembered for this browser only. */
export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(SIDEBAR_KEY); } catch { /* private window or blocked storage */ }
    // Reading the saved choice has to wait for the browser, so it applies right after the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(parseCollapsed(stored));
  }, []);
  useEffect(() => {
    document.querySelector(".workspace-root")?.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* the choice just won't be remembered */ }
  };
  return (
    <button type="button" className="side-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={toggle}>
      <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
      </svg>
    </button>
  );
}
