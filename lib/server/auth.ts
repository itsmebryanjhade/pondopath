import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Actor = { userId: string; businessId: string; role: "owner" | "finance" };

export const requireActor = cache(async (): Promise<Actor> => {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) redirect("/login?reason=session");
  const membership = await client.from("memberships").select("business_id,role")
    .eq("user_id", data.claims.sub).maybeSingle();
  if (membership.error) throw new Error("Your workspace could not be loaded. Please try again.");
  if (!membership.data) redirect("/setup");
  if (!["owner", "finance"].includes(membership.data.role)) {
    redirect("/login?reason=access");
  }
  return { userId: data.claims.sub, businessId: membership.data.business_id, role: membership.data.role as Actor["role"] };
});
