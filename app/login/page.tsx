import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth-shell";
import styles from "@/app/auth.module.css";

export const metadata = { title: "Sign in | PondoPath" };

async function SessionNotice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reason } = await searchParams;
  if (reason === "session") return <p className={styles.notice} role="status">Please sign in to continue to your workspace.</p>;
  if (reason === "access") return <p className={styles.notice} role="status">Your workspace access has changed. Sign in with an authorized account.</p>;
  return null;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell>
      <p className={styles.eyebrow}>Welcome back</p>
      <h1 className={styles.title}>Sign in to PondoPath</h1>
      <p className={styles.intro}>Your collections, cash forecast, and next steps—all in one workspace.</p>
      <Suspense><SessionNotice searchParams={searchParams} /></Suspense>
      <LoginForm />
      <div className={styles.after}>
        <p>New to PondoPath? Create an account and set up your business workspace.</p>
        <Link href="/signup">Sign up <span aria-hidden="true">↗</span></Link>
        <p>Joining a team? Use the invitation link your business owner shared with you.</p>
      </div>
    </AuthShell>
  );
}
