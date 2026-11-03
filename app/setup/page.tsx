import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { SetupForm } from "./setup-form";
import styles from "@/app/auth.module.css";

export const metadata = { title: "Set up your business | PondoPath" };

export default function SetupPage() {
  return <AuthShell><Suspense fallback={<p className={styles.hint}>Loading your account…</p>}><SetupContent /></Suspense></AuthShell>;
}

async function SetupContent() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/login?reason=session");
  const member = await client.from("memberships").select("business_id").eq("user_id", data.user.id).maybeSingle();
  if (member.error) throw new Error("Workspace access could not be checked. Please try again.");
  if (member.data) redirect("/overview");
  return <>
    <p className={styles.eyebrow}>One business, one clear plan</p>
    <h1 className={styles.title}>Set up your workspace</h1>
    <p className={styles.intro}>Start with an empty private workspace. You’ll be its owner and can add records at your own pace.</p>
    <SetupForm />
  </>;
}
