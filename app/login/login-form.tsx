"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AuthErrorBanner } from "@/components/auth-error-banner";
import { CodeStep } from "@/components/code-step";
import type { LoginState } from "@/lib/server/auth-codes";
import { resendSignupCode, verifySignupCode } from "@/app/signup/actions";
import { signIn } from "./actions";
import { PasswordField } from "@/components/password-field";
import styles from "@/app/auth.module.css";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { message: null, confirmEmail: null } as LoginState);
  const [email, setEmail] = useState("");
  const [dismissed, setDismissed] = useState<LoginState | null>(null);
  const error = state.message;
  if (state.confirmEmail && dismissed !== state) {
    return (
      <div className={styles.swap}>
        {error ? <AuthErrorBanner title="Confirm your email" message={error} />
          : <p className={styles.notice} role="status">Your email isn’t confirmed yet. We sent you a new code.</p>}
        <CodeStep email={state.confirmEmail} verify={verifySignupCode} resend={resendSignupCode} onBack={() => setDismissed(state)} backLabel="Back to sign in" />
      </div>
    );
  }
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      {error && !pending && <AuthErrorBanner id="login-error" title="Couldn’t sign in" message={error} />}
      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>Work email</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} className={styles.input} aria-describedby={error ? "login-error" : undefined} />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" describedBy={error ? "login-error" : undefined} />
      <p className={styles.forgot}><Link href="/forgot-password">Forgot password?</Link></p>

      <button disabled={pending} className={styles.submit}>{pending ? "Signing in…" : "Sign in"}<span aria-hidden="true">↗</span></button>
    </form>
  );
}
