import type { ReactNode } from "react";
import Link from "next/link";
import { ProductBrand } from "@/components/product-brand";
import styles from "@/app/legal.module.css";

export const CONTACT_EMAIL = "bryanjhade.e@gmail.com";

/** Shared frame for the public Privacy and Terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className={styles.legal}>
      <a className="skip-link" href="#legal-main">Skip to content</a>
      <header className={styles.header}>
        <Link href="/" aria-label="PondoPath home"><ProductBrand /></Link>
        <Link className={styles.back} href="/">Back to home</Link>
      </header>
      <main id="legal-main" tabIndex={-1} className={styles.main}>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated {updated}</p>
        {children}
        <p className={styles.contact}>Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </main>
      <footer className={styles.footer}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <span>© 2026 SoloForge.</span>
      </footer>
    </div>
  );
}
