import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LOGIN_NOTICE_COOKIE } from "@/lib/auth-notice";
import { createClient } from "@/lib/supabase/server";

/** Where a person is in an emailed-code flow. `code` means a code was sent and is now being asked for. */
export type CodeStep = { step: "details" | "code"; email: string; message: string | null; field?: "email" | "password" | "confirmation" };
export type LoginState = { message: string | null; confirmEmail: string | null };
export type CodeKind = "signup" | "recovery";

const email = z.email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(12).max(200);
const code = z.string().transform((value) => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/));

const SIGNUP_CODE_FAILED = "We couldn’t send a confirmation code. Try again in a few minutes.";
const BAD_CODE = "Enter the 6-digit code from your email.";
const WRONG_CODE = "That code didn’t work or has expired. Request a new one.";
const WAIT = "Please wait a minute before asking for another code.";

const limited = (error: { status?: number; code?: string } | null | undefined) =>
  !!error && (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit");

const authUnavailable = (error: { name?: string; code?: string }) =>
  error.name === "AuthRetryableFetchError" || error.code === "unexpected_failure";

/** After a session exists: members go to their workspace, new accounts continue to setup. Never returns. */
async function landInWorkspace(client: Awaited<ReturnType<typeof createClient>>, fallback: "/setup" | "/overview"): Promise<never> {
  const member = await client.from("memberships").select("business_id").maybeSingle();
  if (member.error) {
    await client.auth.signOut();
    redirect("/login");
  }
  if (!member.data) redirect(fallback === "/overview" ? "/setup" : fallback);
  (await cookies()).set(LOGIN_NOTICE_COOKIE, "signed-in", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60, path: "/",
  });
  redirect("/overview");
}

export async function startSignup(form: FormData): Promise<CodeStep> {
  const details = { step: "details", email: "" } as const;
  const parsed = z.object({ email, password, confirmation: z.string().max(200) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "email") return { ...details, field, message: "Enter a valid email address." };
    if (field === "confirmation") return { ...details, field, message: "Re-enter your password." };
    return { ...details, field: "password", message: "Use a password of at least 12 characters and no more than 200." };
  }
  if (parsed.data.password !== parsed.data.confirmation) {
    return { ...details, field: "confirmation", message: "The passwords don’t match. Enter the same password twice." };
  }
  const client = await createClient();
  const { data, error } = await client.auth.signUp({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (limited(error)) return { ...details, message: WAIT };
    if (error.code === "weak_password") {
      return { ...details, field: "password", message: "Choose a stronger password you don’t use elsewhere." };
    }
    // Auth JS keeps the message but drops the provider code on a 500.
    if (error.code === "email_address_not_authorized" ||
        (error.name === "AuthRetryableFetchError" && error.status === 500 && error.message === "Error sending confirmation email")) {
      return { ...details, message: SIGNUP_CODE_FAILED };
    }
    if (authUnavailable(error)) return { ...details, message: "Signup is temporarily unavailable. Try again in a few minutes." };
    return { ...details, message: "Check your details and try again. If you already have an account, sign in below." };
  }
  // With email confirmation off, Supabase signs the person in right away.
  if (data.session) redirect("/setup");
  return { step: "code", email: parsed.data.email, message: null };
}

export async function verifyCode(kind: CodeKind, form: FormData): Promise<string | null> {
  const parsed = z.object({ email, token: code }).safeParse({ email: form.get("email"), token: form.get("token") });
  if (!parsed.success) return BAD_CODE;
  const client = await createClient();
  const { error } = await client.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: kind });
  if (error) return WRONG_CODE;
  return landInWorkspace(client, "/setup");
}

/** Always answers the same way for unknown addresses so the screen never reveals who has an account. */
export async function resendCode(kind: CodeKind, address: string): Promise<string> {
  const parsed = email.safeParse(address);
  if (!parsed.success) return "Enter a valid email address.";
  const client = await createClient();
  const result = kind === "signup"
    ? await client.auth.resend({ type: "signup", email: parsed.data })
    : await client.auth.resetPasswordForEmail(parsed.data);
  if (limited(result.error)) return WAIT;
  return "If this email can be used, we sent a new code.";
}

export async function startPasswordReset(form: FormData): Promise<CodeStep> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { step: "details", email: "", message: "Enter a valid email address." };
  const client = await createClient();
  const { error } = await client.auth.resetPasswordForEmail(parsed.data);
  if (limited(error)) return { step: "details", email: "", message: WAIT };
  // The same result for known and unknown addresses.
  return { step: "code", email: parsed.data, message: null };
}

export async function finishPasswordReset(form: FormData): Promise<string | null> {
  const fields = z.object({ email, token: code, password, confirmation: z.string().max(200) });
  const parsed = fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const paths = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    if (paths.has("token") || paths.has("email")) return BAD_CODE;
    return "Choose a new password of at least 12 characters.";
  }
  if (parsed.data.password !== parsed.data.confirmation) return "The two passwords don’t match.";
  const client = await createClient();
  const verified = await client.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "recovery" });
  if (verified.error) return WRONG_CODE;
  const updated = await client.auth.updateUser({ password: parsed.data.password });
  if (updated.error) return "Your new password could not be saved. Please try again with a strong, unique password.";
  return landInWorkspace(client, "/setup");
}

export async function signInWithPassword(form: FormData): Promise<LoginState> {
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { message: "Enter your email address and password.", confirmEmail: null };
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      const { error: resendError } = await client.auth.resend({ type: "signup", email: parsed.data.email });
      const message = resendError
        ? limited(resendError) ? WAIT : "We couldn’t send a new code. Use a code you already received or try again in a minute."
        : null;
      return { message, confirmEmail: parsed.data.email };
    }
    if (limited(error)) return { message: "Too many sign-in attempts. Wait a few minutes and try again.", confirmEmail: null };
    if (authUnavailable(error)) return { message: "Sign-in is temporarily unavailable. Try again in a few minutes.", confirmEmail: null };
    return { message: "Check your email and password, or use Forgot password to reset it.", confirmEmail: null };
  }
  const member = await client.from("memberships").select("business_id").maybeSingle();
  if (member.error) {
    await client.auth.signOut();
    return { message: "Workspace access could not be checked. Please try again.", confirmEmail: null };
  }
  return landInWorkspace(client, "/setup");
}
