import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { DashboardIcon } from "./dashboard-icon";
import { ProductBrand } from "./product-brand";
import styles from "@/app/auth.module.css";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-auth-heading" });

export function AuthShell({ children, stage = "login" }: { children: ReactNode; stage?: "login" | "account" | "business" }) {
  const progress = stage === "business" ? 1 : 0;
  return (
    <main className={`${font.className} ${headingFont.variable} ${styles.shell}`}>
      <section className={styles.entry} aria-label="Account access">
        <header className={styles.header}>
          <Link href="/" aria-label="PondoPath home"><ProductBrand showAttribution={false} /></Link>
          <Link href="/" className={styles.back}>Back to home <span aria-hidden="true">↗</span></Link>
        </header>
        <div className={styles.formArea}>
          {stage !== "login" && <ol className={styles.progress} aria-label="Workspace setup progress">
            {["Account", "Business", "Workspace"].map((label, index) => <li key={label} className={index < progress ? styles.complete : index === progress ? styles.current : undefined}><span>{index < progress ? "✓" : index + 1}</span>{label}</li>)}
          </ol>}
          {/* Only the form moves between steps; the header and preview panel stay still. Next keeps visited
              pages mounted but hidden, and this CSS animation replays each time a step is shown. */}
          <div className={styles.step}>{children}</div>
        </div>
        <footer className={styles.footer}>© 2026 PondoPath by SoloForge.</footer>
      </section>
      <aside className={styles.story} aria-label="About your workspace">
        <div className={styles.storyContent}>
          <div className={styles.previewHead}><div><p className={styles.storyEyebrow}>YOUR PRIVATE WORKSPACE</p><p className={styles.statement}>A clearer view of<br /><span>the next 30 days.</span></p></div><span>Preview</span></div>
          <div className={styles.workspacePreview}>
            <div className={styles.previewForecast}>
              <span><DashboardIcon name="sparkle" size={15} />Cash-flow outlook</span>
              <p>Projected cash in 30 days</p>
              <strong>₱10,000</strong>
              <small>Expected receipts are not recorded cash.</small>
              <div><span>Earliest projected shortfall</span><strong>Friday · ₱40,000 gap</strong></div>
            </div>
            <div className={styles.previewChart} aria-hidden="true">
              <span>30-day balance</span>
              <svg viewBox="0 0 260 110"><line x1="10" y1="66" x2="250" y2="66" /><path d="M10 29 L34 29 L34 88 L72 88 L72 53 L250 53" /><circle cx="34" cy="88" r="4" /></svg>
              <div><span>29 Oct</span><span>27 Nov</span></div>
            </div>
          </div>
          <div className={styles.previewMetrics}>
            <div><span><DashboardIcon name="wallet" size={16} /></span><p>Recorded cash<strong>₱40,000</strong></p></div>
            <div><span><DashboardIcon name="arrowIn" size={16} /></span><p>Expected receipts<strong>₱50,000</strong></p></div>
            <div><span><DashboardIcon name="arrowOut" size={16} /></span><p>Expenses due<strong>₱80,000</strong></p></div>
          </div>
          <p className={styles.storyNote}>Promises remain separate from verified money received. Your team confirms every update.</p>
        </div>
      </aside>
    </main>
  );
}
