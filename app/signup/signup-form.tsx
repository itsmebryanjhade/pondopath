"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { AuthErrorBanner } from "@/components/auth-error-banner";
import { CodeStep } from "@/components/code-step";
import { PasswordField } from "@/components/password-field";
import type { CodeStep as CodeStepState } from "@/lib/server/auth-codes";
import { finishSignup, registerAccount, resendSignupCode, verifySignupCode } from "./actions";
import styles from "@/app/auth.module.css";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
const readHash = () => window.location.hash;
const serverHash = () => "";

export function SignupForm() {
  const fragment = useSyncExternalStore(subscribe, readHash, serverHash);
  const params = new URLSearchParams(fragment.slice(1));
  const userId = params.get("userId") ?? "";
  const token = params.get("token") ?? "";
  const hasInvitation = /^[0-9a-f-]{36}$/i.test(userId) && /^[a-zA-Z0-9_-]{32,256}$/.test(token);
  const [error, action, pending] = useActionState(finishSignup, null);
  const [registration, register, registering] = useActionState(registerAccount, { step: "details", email: "", message: null } as CodeStepState);
  const [dismissed, setDismissed] = useState<CodeStepState | null>(null);
  const [email, setEmail] = useState("");
  const field = registering ? undefined : registration.field;
  const askingForCode = !hasInvitation && registration.step === "code" && dismissed !== registration;
  return (
    <>
      <div key={askingForCode ? "code" : "details"} className={styles.swap}>
      <p className={styles.eyebrow}>{askingForCode ? "Almost there" : "Your business, connected"}</p>
      <h1 className={styles.title}>{askingForCode ? "Check your email" : hasInvitation ? "Join your team" : "Create your account"}</h1>
      <p className={styles.intro}>{askingForCode ? "Enter the code we sent to confirm it’s really you. Then you’ll set up your business." : hasInvitation ? "Set a password to accept your invitation and start working with your team." : "Start your own private cash-planning workspace. You can invite your team after setup."}</p>
      {askingForCode ? (
        <CodeStep email={registration.email} verify={verifySignupCode} resend={resendSignupCode} onBack={() => setDismissed(registration)} />
      ) : hasInvitation ? (
        <form action={action} className={styles.form} aria-busy={pending}>
          {error && !pending && <AuthErrorBanner id="signup-error" title="Couldn’t join your team" message={error} />}
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="token" value={token} />
          <PasswordField id="password" label="Password" autoComplete="new-password" minLength={12} describedBy={error ? "password-help signup-error" : "password-help"} />
          <p id="password-help" className={styles.hint}>Use at least 12 characters. Choose a strong password you don’t use elsewhere.</p>
          <PasswordField id="confirmation" label="Confirm password" autoComplete="new-password" minLength={12} describedBy={error ? "signup-error" : undefined} />

          <button disabled={pending} className={styles.submit}>{pending ? "Creating your account…" : "Create account & join"}<span aria-hidden="true">↗</span></button>
          <p className={styles.hint}>You’ll join the workspace selected by your business owner with finance staff access.</p>
        </form>
      ) : <form action={register} className={styles.form} aria-busy={registering}>
        {registration.message && !registering && <AuthErrorBanner id="signup-error" title="Couldn’t create your account" message={registration.message} />}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="signup-email">Work email</label>
          <input className={styles.input} id="signup-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com"
            value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={field === "email" || undefined} aria-describedby={field === "email" ? "signup-error" : undefined} />
        </div>
        <PasswordField id="password" label="Password" autoComplete="new-password" minLength={12}
          invalid={field === "password"} describedBy={field === "password" ? "signup-error signup-password-help" : "signup-password-help"} />
        <p id="signup-password-help" className={styles.hint}>Use at least 12 characters and a password you don’t use elsewhere.</p>
        <PasswordField id="confirmation" label="Confirm password" autoComplete="new-password" minLength={12}
          invalid={field === "confirmation"} describedBy={field === "confirmation" ? "signup-error" : undefined} />
        <button disabled={registering} className={styles.submit}>{registering ? "Creating account…" : "Sign up"}<span aria-hidden="true">↗</span></button>
        <p className={styles.hint}>Have an invitation? Open the private link your owner shared with you instead.</p>
      </form>}
      <div className={styles.after}><p>Already have an account?</p><Link href="/login">Sign in to PondoPath <span aria-hidden="true">↗</span></Link></div>
      </div>
    </>
  );
}
