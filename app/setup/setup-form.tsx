"use client";

import { useActionState } from "react";
import { createWorkspace } from "./actions";
import styles from "@/app/auth.module.css";

export function SetupForm() {
  const [error, action, pending] = useActionState(createWorkspace, null);
  return <form action={action} className={styles.form} aria-busy={pending}>
    <div className={styles.fieldGroup}><label className={styles.label} htmlFor="owner-name">Your name</label><input className={styles.input} id="owner-name" name="name" autoComplete="name" required maxLength={200} /></div>
    <div className={styles.fieldGroup}><label className={styles.label} htmlFor="business-name">Business name</label><input className={styles.input} id="business-name" name="business" autoComplete="organization" required maxLength={200} /></div>
    <p className={styles.hint}>This starts a private workspace in Philippine pesos. You can enter your opening cash and invite finance teammates after setup.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.submit} disabled={pending}>{pending ? "Creating workspace…" : "Create business workspace"}<span aria-hidden="true">↗</span></button>
  </form>;
}
