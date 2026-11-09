"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CodeStep } from "@/components/code-step";
import { PasswordField } from "@/components/password-field";
import type { CodeStep as CodeStepState } from "@/lib/server/auth-codes";
import { completeReset, requestReset, resendResetCode } from "./actions";
import styles from "@/app/auth.module.css";

export function ResetForm() {
  const [request, ask, asking] = useActionState(requestReset, { step: "details", email: "", message: null } as CodeStepState);
  const [dismissed, setDismissed] = useState<CodeStepState | null>(null);
  const codeSent = request.step === "code" && dismissed !== request;
  return (
    <div key={codeSent ? "code" : "email"} className={styles.swap}>
      <p className={styles.eyebrow}>{codeSent ? "Check your email" : "Locked out?"}</p>
      <h1 className={styles.title}>{codeSent ? "Choose a new password" : "Reset your password"}</h1>
      <p className={styles.intro}>{codeSent ? "If an account uses this email, we sent a 6-digit code. Enter it with your new password." : "Enter your work email and we’ll send you a 6-digit code to set a new password."}</p>
      {codeSent ? (
        <CodeStep email={request.email} verify={completeReset} resend={resendResetCode} onBack={() => setDismissed(request)} submitLabel="Save password and sign in" pendingLabel="Saving…">
          <PasswordField id="password" label="New password" autoComplete="new-password" minLength={12} describedBy="reset-password-help" />
          <p id="reset-password-help" className={styles.hint}>Use at least 12 characters and a password you don’t use elsewhere.</p>
          <PasswordField id="confirmation" label="Confirm new password" autoComplete="new-password" minLength={12} />
        </CodeStep>
      ) : (
        <form action={ask} className={styles.form} aria-busy={asking}>
          <div className={styles.fieldGroup}>
            <label htmlFor="reset-email" className={styles.label}>Work email</label>
            <input id="reset-email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required maxLength={254} className={styles.input} />
          </div>
          {request.message && !asking && <p role="alert" className={styles.error}>{request.message}</p>}
          <button disabled={asking} className={styles.submit}>{asking ? "Sending code…" : "Send code"}<span aria-hidden="true">↗</span></button>
        </form>
      )}
      <div className={styles.after}><p>Remembered it?</p><Link href="/login">Back to sign in <span aria-hidden="true">↗</span></Link></div>
    </div>
  );
}
