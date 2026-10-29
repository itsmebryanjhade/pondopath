import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const automationRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("scan") }),
  z.strictObject({ operation: z.literal("create"), runId: z.uuid(), expectationIds: z.array(z.uuid()).max(1000) }),
  z.strictObject({ operation: z.literal("finish"), runId: z.uuid(), success: z.boolean(), errorCode: z.enum(["HTTP_ERROR", "CONNECTION_ERROR", "WORKFLOW_ERROR", "INTERRUPTED"]).optional() }),
]);

export function authorizeAutomation(authorization: string | null) {
  const token = process.env.AUTOMATION_TOKEN;
  const businessId = process.env.AUTOMATION_BUSINESS_ID;
  if (!token || token.length < 32 || !z.uuid().safeParse(businessId).success) throw new Error("AUTOMATION_UNAVAILABLE");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${token}`))) throw new Error("UNAUTHENTICATED");
  return businessId!;
}

export async function runAutomation(businessId: string, request: z.infer<typeof automationRequestSchema>) {
  const { data, error } = await createAdminClient().rpc("automation_followups", { p_business_id: businessId, p_request: request });
  if (error) throw new Error(["NOT_FOUND", "VALIDATION_ERROR"].includes(error.message) ? "INVALID_REQUEST" : "AUTOMATION_UNAVAILABLE");
  if (data && typeof data === "object" && !Array.isArray(data) && data.errorCode) throw new Error("LIMIT_REACHED");
  return data;
}
