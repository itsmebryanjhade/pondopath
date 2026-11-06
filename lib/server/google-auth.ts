import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { requireActor } from "@/lib/server/auth";
import { DRIVE_FILE_SCOPE, exchangeCode, googleConfig, revoke } from "@/lib/server/google";
import { openToken, sealToken } from "@/lib/server/token-safe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// One short-lived, httpOnly cookie carries the sign-in state and PKCE verifier between the two routes.
const COOKIE = "pp_google_oauth";
const COOKIE_PATH = "/api/google";

/** The app's own address from APP_URL (localhost outside production); never taken from request headers. */
function appOrigin(): string {
  const configured = process.env.APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  return new URL(configured).origin;
}
const redirectUri = () => `${appOrigin()}/api/google/callback`;

function redirectTo(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}
const secure = () => appOrigin().startsWith("https:") ? "; Secure" : "";
const setCookie = (value: string) => `${COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=600; HttpOnly; SameSite=Lax${secure()}`;
const clearCookie = () => `${COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure()}`;
const done = (result: "connected" | "failed") => redirectTo(`${appOrigin()}/imports?google=${result}`, clearCookie());

function readCookie(request: Request): { state: string; verifier: string; userId: string; businessId: string } | null {
  const raw = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return ["state", "verifier", "userId", "businessId"].every(key => typeof value?.[key] === "string") ? value : null;
  } catch { return null; }
}
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** GET /api/google/connect — owner only. */
export async function startGoogleSignIn(request: Request): Promise<Response> {
  void request;
  try {
    const actor = await requireActor();
    if (actor.role !== "owner") return done("failed");
    const { clientId } = googleConfig();
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
    const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({
      client_id: clientId, redirect_uri: redirectUri(), response_type: "code", scope: `openid email ${DRIVE_FILE_SCOPE}`,
      access_type: "offline", prompt: "consent", include_granted_scopes: "false", state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    })) google.searchParams.set(key, value);
    const cookie = Buffer.from(JSON.stringify({ state, verifier, userId: actor.userId, businessId: actor.businessId })).toString("base64url");
    return redirectTo(google.href, setCookie(cookie));
  } catch (error) {
    unstable_rethrow(error);
    return done("failed");
  }
}

/** GET /api/google/callback — checks state, PKCE and the same owner, then stores only the sealed refresh token. */
export async function finishGoogleSignIn(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const saved = readCookie(request);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!saved || !code || !state || url.searchParams.has("error") || !same(state, saved.state)) return done("failed");
    const actor = await requireActor();
    if (actor.role !== "owner" || actor.userId !== saved.userId || actor.businessId !== saved.businessId) return done("failed");
    const tokens = await exchangeCode(code, saved.verifier, redirectUri());
    const result = await createAdminClient().rpc("google_connection_save", {
      p_business: actor.businessId, p_owner: actor.userId, p_email: tokens.email, p_sealed: sealToken(tokens.refreshToken), p_scopes: tokens.scopes.slice(0, 10),
    });
    return done(result.error ? "failed" : "connected");
  } catch (error) {
    unstable_rethrow(error);
    return done("failed");
  }
}

/** Owner only: revoke the token at Google (best effort), then disconnect Google and all its files. History is kept. */
export async function disconnectGoogle(): Promise<void> {
  const actor = await requireActor();
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  const sealed = await createAdminClient().rpc("google_connection_token", { p_business: actor.businessId });
  if (!sealed.error && typeof sealed.data === "string") {
    try { await revoke(openToken(sealed.data)); } catch { /* The stored token is deleted below either way. */ }
  }
  const client = await createClient();
  const result = await client.rpc("disconnect_google");
  if (result.error) throw new Error(result.error.message === "FORBIDDEN" ? "FORBIDDEN" : "SERVICE_UNAVAILABLE");
}
