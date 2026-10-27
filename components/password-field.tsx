"use client";

import { useState } from "react";
import styles from "@/app/auth.module.css";

export function PasswordField({ id, label, autoComplete, minLength, describedBy }: {
  id: string; label: string; autoComplete: "current-password" | "new-password"; minLength?: number; describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.password}>
        <input id={id} name={id} type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={autoComplete} required minLength={minLength} maxLength={200} className={styles.input} aria-describedby={describedBy} />
        <button type="button" className={styles.reveal} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button>
      </div>
    </div>
  );
}
