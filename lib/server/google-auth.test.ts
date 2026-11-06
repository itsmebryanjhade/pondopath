import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  actor: { userId: "40000000-0000-4000-8000-000000000001", businessId: "10000000-0000-4000-8000-000000000001", role: "owner" as "owner" | "finance" },
  adminRpc: vi.fn(), userRpc: vi.fn(), exchange: vi.fn(), revoke: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireActor: async () => state.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.adminRpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.userRpc }) }));
vi.mock("@/lib/server/google", () => ({ exchangeCode: state.exchange, revoke: state.revoke, DRIVE_FILE_SCOPE: "https://www.googleapis.com/auth/drive.file",
  googleConfig: () => ({ clientId: "client.apps.googleusercontent.com", clientSecret: "secret", pickerKey: "", projectNumber: "" }) }));
import { disconnectGoogle, finishGoogleSignIn, startGoogleSignIn } from "./google-auth";
import { openToken, sealToken } from "./token-safe";

const origin = "http://localhost:3000";
const cookieOf = (response: Response) => response.headers.get("set-cookie") ?? "";
async function start() {
  const response = await startGoogleSignIn(new Request(origin + "/api/google/connect"));
  const google = new URL(response.headers.get("location")!);
  const cookie = cookieOf(response).split(";")[0];
  return { response, google, cookie };
}
function callback(query: string, cookie: string) {
  return finishGoogleSignIn(new Request(origin + "/api/google/callback?" + query, { headers: { cookie } }));
}

beforeEach(() => {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  state.actor.role = "owner";
  state.adminRpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.userRpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.exchange.mockReset().mockResolvedValue({ refreshToken: "1//fictional-refresh", scopes: ["openid", "https://www.googleapis.com/auth/drive.file"], email: "owner@fictional.example" });
  state.revoke.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Connect Google sign-in", () => {
  it("sends the owner to Google with drive.file only, offline access, state and PKCE", async () => {
    const { response, google } = await start();
    expect(response.status).toBe(302);
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/drive.file");
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("prompt")).toBe("consent");
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
    expect(google.searchParams.get("redirect_uri")).toBe(origin + "/api/google/callback");
    expect(google.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(cookieOf(response)).toMatch(/pp_google_oauth=.+; Path=\/api\/google; Max-Age=600; HttpOnly; SameSite=Lax/);
  });

  it("refuses a finance user without calling Google", async () => {
    state.actor.role = "finance";
    const response = await startGoogleSignIn(new Request(origin + "/api/google/connect"));
    expect(response.headers.get("location")).toBe(origin + "/imports?google=failed");
    expect(state.exchange).not.toHaveBeenCalled();
  });

  it("stores only a sealed token on success and clears the cookie", async () => {
    const { google, cookie } = await start();
    const verifier = state.exchange.mock.calls.length;
    expect(verifier).toBe(0);
    const response = await callback(`code=fictional-code&state=${google.searchParams.get("state")}`, cookie);
    expect(response.headers.get("location")).toBe(origin + "/imports?google=connected");
    expect(cookieOf(response)).toContain("pp_google_oauth=; Path=/api/google; Max-Age=0");
    const [code, codeVerifier, redirect] = state.exchange.mock.calls[0];
    expect(code).toBe("fictional-code");
    expect(createHash("sha256").update(codeVerifier).digest("base64url")).toBe(google.searchParams.get("code_challenge"));
    expect(redirect).toBe(origin + "/api/google/callback");
    const [name, args] = state.adminRpc.mock.calls[0];
    expect(name).toBe("google_connection_save");
    expect(args).toMatchObject({ p_business: state.actor.businessId, p_owner: state.actor.userId, p_email: "owner@fictional.example" });
    expect(args.p_sealed.startsWith("v1.")).toBe(true);
    expect(args.p_sealed).not.toContain("fictional-refresh");
    expect(openToken(args.p_sealed)).toBe("1//fictional-refresh");
  });

  it("refuses a missing or mismatched state", async () => {
    const { cookie } = await start();
    for (const query of ["code=c", "code=c&state=wrong-state-value-wrong-state-value"]) {
      expect((await callback(query, cookie)).headers.get("location")).toBe(origin + "/imports?google=failed");
    }
    expect((await callback("code=c&state=x", "")).headers.get("location")).toBe(origin + "/imports?google=failed");
    expect(state.exchange).not.toHaveBeenCalled();
  });

  it("refuses a callback from a different signed-in user", async () => {
    const { google, cookie } = await start();
    state.actor = { ...state.actor, userId: "40000000-0000-4000-8000-000000000002" };
    expect((await callback(`code=c&state=${google.searchParams.get("state")}`, cookie)).headers.get("location")).toBe(origin + "/imports?google=failed");
    state.actor = { ...state.actor, userId: "40000000-0000-4000-8000-000000000001" };
    expect(state.exchange).not.toHaveBeenCalled();
  });

  it("stores nothing when Google refuses drive.file or the owner cancels", async () => {
    const { google, cookie } = await start();
    state.exchange.mockRejectedValueOnce(new Error("GOOGLE_RECONNECT"));
    expect((await callback(`code=c&state=${google.searchParams.get("state")}`, cookie)).headers.get("location")).toBe(origin + "/imports?google=failed");
    expect((await callback(`error=access_denied&state=${google.searchParams.get("state")}`, cookie)).headers.get("location")).toBe(origin + "/imports?google=failed");
    expect(state.adminRpc).not.toHaveBeenCalled();
  });

  it("a different Google account simply replaces the stored email", async () => {
    const { google, cookie } = await start();
    state.exchange.mockResolvedValueOnce({ refreshToken: "r2", scopes: ["https://www.googleapis.com/auth/drive.file"], email: "other@fictional.example" });
    await callback(`code=c&state=${google.searchParams.get("state")}`, cookie);
    expect(state.adminRpc.mock.calls[0][1].p_email).toBe("other@fictional.example");
  });
});

describe("Disconnect Google", () => {
  it("revokes the token at Google, then disconnects through the owner's own client", async () => {
    state.adminRpc.mockResolvedValueOnce({ data: sealToken("1//fictional-refresh"), error: null });
    await disconnectGoogle();
    expect(state.revoke).toHaveBeenCalledWith("1//fictional-refresh");
    expect(state.userRpc).toHaveBeenCalledWith("disconnect_google");
  });
  it("still disconnects when there is no usable token", async () => {
    state.adminRpc.mockResolvedValueOnce({ data: null, error: { message: "GOOGLE_RECONNECT" } });
    await disconnectGoogle();
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.userRpc).toHaveBeenCalledWith("disconnect_google");
  });
  it("is owner-only", async () => {
    state.actor.role = "finance";
    await expect(disconnectGoogle()).rejects.toThrow("FORBIDDEN");
    expect(state.userRpc).not.toHaveBeenCalled();
  });
});
