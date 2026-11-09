"use client";

import { useRef } from "react";
import Link from "next/link";
import { DashboardIcon } from "./dashboard-icon";
import styles from "@/app/landing.module.css";

const links = [
  ["#how-it-works", "How it works"],
  ["#features", "Features"],
  ["#control", "Control & safety"],
  ["#faq", "FAQ"],
] as const;

export function LandingMobileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute("open");

  return (
    <details
      ref={menu}
      className={styles.mobileMenu}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menu.current?.open) return;
        close();
        menu.current.querySelector("summary")?.focus();
      }}
    >
      <summary aria-label="Open navigation"><span>Menu</span><DashboardIcon name="chevron" /></summary>
      <div className={styles.mobileMenuPanel} onClick={(event) => { if ((event.target as Element).closest("a")) close(); }}>
        <nav aria-label="Mobile navigation">
          {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div>
          <Link className={styles.outlineButton} href="/login">Log in</Link>
          <Link className={styles.primaryButton} href="/signup">Create workspace</Link>
        </div>
      </div>
    </details>
  );
}
