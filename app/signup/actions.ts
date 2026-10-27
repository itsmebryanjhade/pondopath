"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_NOTICE_COOKIE } from "@/lib/auth-notice";
import { acceptInvitation } from "@/lib/server/invitations";

export async function finishSignup(_previous: string | null, form: FormData): Promise<string | null> {
  const error = await acceptInvitation(form);
  if (error) return error;
  (await cookies()).set(LOGIN_NOTICE_COOKIE, "signed-in", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60, path: "/" });
  redirect("/overview");
}
