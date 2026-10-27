"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { PasswordField } from "@/components/password-field";
import { finishSignup } from "./actions";
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
  return (
    <>
      <p className={styles.eyebrow}>Your team, connected</p>
      <h1 className={styles.title}>{hasInvitation ? "Create your account" : "Join your workspace"}</h1>
      <p className={styles.intro}>{hasInvitation ? "Set a password to accept your invitation and start working with your team." : "PondoPath workspaces are private. Your business owner can invite you to join as a finance teammate."}</p>
      {hasInvitation ? (
        <form action={action} className={styles.form} aria-busy={pending}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="token" value={token} />
          <PasswordField id="password" label="Password" autoComplete="new-password" minLength={12} describedBy={error ? "password-help signup-error" : "password-help"} />
          <p id="password-help" className={styles.hint}>Use at least 12 characters. Choose a strong password you don’t use elsewhere.</p>
          <PasswordField id="confirmation" label="Confirm password" autoComplete="new-password" minLength={12} describedBy={error ? "signup-error" : undefined} />
          {error && !pending && <p id="signup-error" role="alert" className={styles.error}>{error}</p>}
          <button disabled={pending} className={styles.submit}>{pending ? "Creating your account…" : "Create account & join"}<span aria-hidden="true">↗</span></button>
          <p className={styles.hint}>You’ll join the workspace selected by your business owner with finance staff access.</p>
        </form>
      ) : (
        <div className={styles.notice}>
          <strong>Have an invitation?</strong>
          <p>Open the full private link your owner shared with you. If it has expired, ask them to create another.</p>
        </div>
      )}
      <div className={styles.after}><p>Already have an account?</p><Link href="/login">Sign in to PondoPath <span aria-hidden="true">↗</span></Link></div>
    </>
  );
}
