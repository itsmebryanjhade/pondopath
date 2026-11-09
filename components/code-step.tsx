"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { OtpField } from "./otp-field";
import styles from "@/app/auth.module.css";

/** Asks for the emailed code. `verify` redirects on success and returns a message on failure. */
export function CodeStep({ email, verify, resend, onBack, submitLabel = "Verify and continue", pendingLabel = "Checking…", backLabel = "Use a different email", cooldown = 60, children }: {
  email: string;
  verify: (previous: string | null, form: FormData) => Promise<string | null>;
  resend: (email: string) => Promise<string>;
  onBack: () => void;
  submitLabel?: string;
  pendingLabel?: string;
  backLabel?: string;
  cooldown?: number;
  /** Extra fields shown under the code, such as a new password. When present, the code does not auto-submit. */
  children?: ReactNode;
}) {
  const [error, action, pending] = useActionState(verify, null);
  const [note, setNote] = useState("");
  const [seconds, setSeconds] = useState(cooldown);
  const [sending, startSending] = useTransition();
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <input type="hidden" name="email" value={email} />
      <p id="code-help" className={styles.codeNote}>We sent a 6-digit code to <strong>{email}</strong>. It can take a minute to arrive, so check your spam folder too.</p>
      <OtpField describedBy={error ? "code-help code-error" : "code-help"} autoSubmit={!children} disabled={pending} />
      {children}
      {error && !pending && <p id="code-error" role="alert" className={styles.error}>{error}</p>}
      <button disabled={pending} className={styles.submit}>{pending ? pendingLabel : submitLabel}<span aria-hidden="true">↗</span></button>
      <div className={styles.codeActions}>
        <button type="button" className={styles.textButton} disabled={seconds > 0 || sending} onClick={() => startSending(async () => { setNote(await resend(email)); setSeconds(cooldown); })}>
          {sending ? "Sending…" : seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
        </button>
        <button type="button" className={styles.textButton} onClick={onBack}>{backLabel}</button>
      </div>
      <p role="status" className={styles.hint}>{note}</p>
    </form>
  );
}
