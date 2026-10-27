import "server-only";
import { z } from "zod";
import { requireActor } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InvitationResult = { error?: string; link?: string; email?: string };
const recipient = z.object({ name: z.string().trim().min(1).max(200), email: z.email().max(254).transform((value) => value.toLowerCase()) });
const signup = z.object({
  userId: z.uuid(), token: z.string().regex(/^[a-zA-Z0-9_-]{32,256}$/),
  password: z.string().min(12).max(200), confirmation: z.string().max(200),
}).refine((value) => value.password === value.confirmation);

export async function createInvitation(form: FormData): Promise<InvitationResult> {
  const actor = await requireActor();
  if (actor.role !== "owner") return { error: "Only the business owner can invite teammates." };
  const parsed = recipient.safeParse({ name: form.get("name"), email: form.get("email") });
  if (!parsed.success) return { error: "Enter the teammate's name and a valid email address." };
  try {
    const base = new URL(process.env.APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : ""));
    if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
        (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) {
      return { error: "The invitation address is not configured. Contact the app administrator." };
    }
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: parsed.data.email });
    if (error || !data.user || !data.properties?.hashed_token) {
      return { error: "An invitation could not be created. If this person already has an account, ask them to sign in." };
    }
    const member = await admin.from("memberships").select("business_id,role").eq("user_id", data.user.id).maybeSingle();
    if (member.error || (member.data && (member.data.business_id !== actor.businessId || member.data.role !== "finance"))) {
      return { error: "This account cannot be invited to this workspace." };
    }
    if (!member.data) {
      const inserted = await admin.from("memberships").insert({ business_id: actor.businessId, user_id: data.user.id, role: "finance", display_name: parsed.data.name });
      if (inserted.error) return { error: "Workspace access could not be prepared. Please create the invitation again." };
    }
    const link = new URL("/signup", base);
    // A fragment keeps the bearer token out of HTTP request URLs and referrers.
    link.hash = new URLSearchParams({ userId: data.user.id, token: data.properties.hashed_token }).toString();
    return { link: link.toString(), email: parsed.data.email };
  } catch {
    return { error: "Invitations are temporarily unavailable. Please try again." };
  }
}

export async function acceptInvitation(form: FormData): Promise<string | null> {
  const parsed = signup.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "Use your invitation link and matching passwords of at least 12 characters.";
  const { userId, token, password } = parsed.data;
  const client = await createClient();
  const verified = await client.auth.verifyOtp({ type: "invite", token_hash: token });
  let user = verified.data.user;
  if (verified.error) {
    // A consumed token can only resume password setup in its already authenticated session.
    const current = await client.auth.getUser();
    user = !current.error && current.data.user?.invited_at ? current.data.user : null;
  }
  if (!user || user.id !== userId) {
    if (!verified.error) await client.auth.signOut();
    return "This invitation is invalid or has expired. Ask the owner for a new link.";
  }
  const member = await client.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  if (member.error || member.data?.role !== "finance") {
    await client.auth.signOut();
    return "This invitation does not have workspace access. Contact the business owner.";
  }
  const updated = await client.auth.updateUser({ password });
  if (updated.error) return "Your password could not be saved. Please try again with a strong, unique password.";
  return null;
}
