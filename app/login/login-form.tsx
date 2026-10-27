"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className="field" />
      </div>
      <div className="grid gap-2">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} className="field" />
      </div>
      <p role="alert" className="min-h-6 text-sm text-red-800">{error}</p>
      <button disabled={pending} className="button">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
