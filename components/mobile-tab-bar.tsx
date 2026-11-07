"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SideIconGlyph } from "./side-icons";
import { activeHref, mobileTabs, moreActive, moreItems } from "@/lib/ui/sidebar";

/** Phone and tablet navigation: five spots at the bottom, Add in the centre, and everything else under More. */
export function MobileTabBar({ followupCount, inboxCount }: { followupCount: number; inboxCount: number }) {
  const pathname = usePathname();
  const counts = { inbox: inboxCount, followups: followupCount };
  const current = activeHref(pathname);
  const inMore = moreActive(pathname);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <button type="button" className="mobile-backdrop" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />}
      {open && (
        <div id="more-sheet" ref={sheet} className="mobile-sheet" role="group" aria-label="More pages">
          <ul>{moreItems(counts).map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={`mobile-sheet-link${current === item.href ? " active" : ""}`} aria-current={current === item.href ? "page" : undefined} onNavigate={() => setOpen(false)}>
                <SideIconGlyph name={item.icon} size={20} /><span>{item.label}</span>
                {item.count && <span className={`side-count${item.href === "/followups" ? " urgent" : ""}`} aria-label={item.countLabel}>{item.count}</span>}
              </Link>
            </li>
          ))}</ul>
        </div>
      )}
      <nav className="mobile-bar" aria-label="Main menu">
        <ul>{mobileTabs(counts).map((tab) => (
          <li key={tab.label}>
            {tab.kind === "link" ? (
              <Link href={tab.href} className={`mobile-tab${tab.fab ? " mobile-fab" : ""}${current === tab.href ? " active" : ""}`} aria-current={current === tab.href ? "page" : undefined} onNavigate={() => setOpen(false)}>
                <SideIconGlyph name={tab.icon} size={tab.fab ? 22 : 21} /><span>{tab.label}</span>
                {tab.count && <span className="side-count" aria-label={tab.countLabel}>{tab.count}</span>}
              </Link>
            ) : (
              <button ref={button} type="button" className={`mobile-tab more${inMore ? " active" : ""}`} aria-expanded={open} aria-controls="more-sheet" aria-current={inMore ? "page" : undefined} onClick={() => setOpen((value) => !value)}>
                <SideIconGlyph name={tab.icon} size={21} /><span>{tab.label}</span>
                {tab.count && <span className="side-count urgent" aria-label={tab.countLabel}>{tab.count}</span>}
              </button>
            )}
          </li>
        ))}</ul>
      </nav>
    </>
  );
}
