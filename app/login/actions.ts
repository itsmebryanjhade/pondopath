"use server";

import { redirect } from "next/navigation";
import { signInWithPassword, type LoginState } from "@/lib/server/auth-codes";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_previous: LoginState, form: FormData): Promise<LoginState> {
  return signInWithPassword(form);
}

export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Sign-out could not be completed. Please try again.");
  redirect("/login");
}
