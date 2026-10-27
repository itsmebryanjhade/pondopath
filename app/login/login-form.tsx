"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";
import { PasswordField } from "@/components/password-field";
import styles from "@/app/auth.module.css";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  const [email, setEmail] = useState("");
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>Work email</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} className={styles.input} aria-describedby={error ? "login-error" : undefined} />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" describedBy={error ? "login-error" : undefined} />
      {error && !pending && <p id="login-error" role="alert" className={styles.error}>{error}</p>}
      <button disabled={pending} className={styles.submit}>{pending ? "Signing in…" : "Sign in"}<span aria-hidden="true">↗</span></button>
    </form>
  );
}
