"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export async function signIn(_previous: string | null, form: FormData): Promise<string | null> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return "Enter your email address and password.";
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return "Sign-in failed. Check your details and try again.";
  const member = await client.from("memberships").select("business_id").maybeSingle();
  if (member.error || !member.data) {
    await client.auth.signOut();
    return "This account does not have workspace access. Contact the business owner.";
  }
  redirect("/overview");
}

export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Sign-out could not be completed. Please try again.");
  redirect("/login");
}
