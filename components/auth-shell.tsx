import Link from "next/link";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ProductBrand } from "./product-brand";
import styles from "@/app/auth.module.css";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={`${font.className} ${styles.shell}`}>
      <section className={styles.entry} aria-label="Account access">
        <header className={styles.header}>
          <Link href="/" aria-label="PondoPath home"><ProductBrand /></Link>
          <Link href="/" className={styles.back}>Back to home <span aria-hidden="true">↗</span></Link>
        </header>
        <div className={styles.formArea}>{children}</div>
        <footer className={styles.footer}>© 2026 PondoPath by SoloForge.</footer>
      </section>
      <aside className={styles.story} aria-label="About your workspace">
        <div className={styles.storyContent}>
          <p className={styles.storyEyebrow}>YOUR BUSINESS. A CLEARER CASH PLAN.</p>
          <p className={styles.statement}>Know what’s coming.<br /><span>Plan your next move.</span></p>
          <p className={styles.storyDescription}>Bring customer collections, upcoming bills, and your 30-day cash forecast into one shared view.</p>
          <ol className={styles.steps}>
            <li><span>01</span><div><strong>See the cash picture</strong><p>Current cash, expected receipts, and upcoming expenses.</p></div></li>
            <li><span>02</span><div><strong>Catch changes early</strong><p>See how a delayed payment affects your plan.</p></div></li>
            <li><span>03</span><div><strong>Keep the next step clear</strong><p>Prepare follow-ups for review and track commitments.</p></div></li>
          </ol>
          <p className={styles.storyNote}>Your team stays in control. Expected payments remain separate from money received.</p>
        </div>
      </aside>
    </main>
  );
}
