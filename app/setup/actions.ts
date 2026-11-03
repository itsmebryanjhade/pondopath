"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LOGIN_NOTICE_COOKIE } from "@/lib/auth-notice";
import { createClient } from "@/lib/supabase/server";

const details = z.object({
  business: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});

export async function createWorkspace(_previous: string | null, form: FormData): Promise<string | null> {
  const parsed = details.safeParse({ business: form.get("business"), name: form.get("name") });
  if (!parsed.success) return "Enter your name and business name (up to 200 characters each).";
  const client = await createClient();
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) redirect("/login?reason=session");
  const { error } = await client.rpc("create_business_workspace", {
    p_name: parsed.data.business, p_display_name: parsed.data.name,
  });
  if (error) {
    if (error.message.includes("ALREADY_MEMBER")) redirect("/overview");
    if (error.message.includes("EMAIL_UNCONFIRMED")) return "This account needs email confirmation before setup.";
    return "Your workspace could not be created. Please try again.";
  }
  (await cookies()).set(LOGIN_NOTICE_COOKIE, "signed-in", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60, path: "/",
  });
  redirect("/overview");
}
