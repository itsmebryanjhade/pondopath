"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_NOTICE_COOKIE } from "@/lib/auth-notice";
import { acceptInvitation } from "@/lib/server/invitations";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const registration = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(200),
  confirmation: z.string().max(200),
}).refine(({ password, confirmation }) => password === confirmation);

export async function registerAccount(_previous: string | null, form: FormData): Promise<string | null> {
  const parsed = registration.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "Enter a valid email and matching passwords of at least 12 characters.";
  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error) return "Account creation failed. Please try again or sign in if you already have an account.";
  if (!data.session) return "Sign-up could not finish immediately. Try signing in or contact the app administrator.";
  redirect("/setup");
}

export async function finishSignup(_previous: string | null, form: FormData): Promise<string | null> {
  const error = await acceptInvitation(form);
  if (error) return error;
  (await cookies()).set(LOGIN_NOTICE_COOKIE, "signed-in", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60, path: "/" });
  redirect("/overview");
}
