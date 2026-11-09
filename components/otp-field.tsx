"use client";

import { useState } from "react";
import styles from "@/app/auth.module.css";

/** One field for a 6-digit emailed code. Works with phone and password-manager autofill and keeps digits only. */
export function OtpField({ describedBy, autoSubmit = false, disabled = false }: { describedBy?: string; autoSubmit?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.label} htmlFor="code">6-digit code</label>
      <input
        id="code" name="token" className={`${styles.input} ${styles.otp}`} value={value} disabled={disabled}
        inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required
        aria-describedby={describedBy} autoFocus
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
          setValue(digits);
          if (autoSubmit && digits.length === 6) event.target.form?.requestSubmit();
        }}
        onPaste={(event) => {
          const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
          if (!digits) return;
          event.preventDefault();
          setValue(digits);
          if (autoSubmit && digits.length === 6) { const form = event.currentTarget.form; queueMicrotask(() => form?.requestSubmit()); }
        }}
      />
    </div>
  );
}
