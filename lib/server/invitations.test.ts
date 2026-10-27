import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), admin: vi.fn(), client: vi.fn(), generate: vi.fn(), insert: vi.fn(), member: vi.fn(), verify: vi.fn(), user: vi.fn(), update: vi.fn(), signOut: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { acceptInvitation, createInvitation } from "./invitations";

const userId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(64);
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
const invitation = () => form({ email: "staff@example.com", name: "Finance teammate", businessId: "forged", role: "owner" });
const signup = () => form({ userId, token, password: "a-long-private-password", confirmation: "a-long-private-password" });

describe("private invitations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_URL", "http://localhost:3000");
    mocks.actor.mockResolvedValue({ businessId: "own-business", userId: "owner", role: "owner" });
    mocks.generate.mockResolvedValue({ data: { user: { id: userId }, properties: { hashed_token: token } }, error: null });
    mocks.member.mockResolvedValue({ data: null, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.member, insert: mocks.insert };
    mocks.admin.mockReturnValue({ auth: { admin: { generateLink: mocks.generate } }, from: () => query });
    mocks.verify.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    mocks.update.mockResolvedValue({ error: null });
    mocks.client.mockResolvedValue({ auth: { verifyOtp: mocks.verify, getUser: mocks.user, updateUser: mocks.update, signOut: mocks.signOut }, from: () => query });
  });
  it("denies finance users before creating an administrative client", async () => {
    mocks.actor.mockResolvedValue({ role: "finance" });
    expect((await createInvitation(invitation())).error).toMatch(/owner/i);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner's business and a fixed finance role", async () => {
    const result = await createInvitation(invitation());
    expect(mocks.insert).toHaveBeenCalledWith({ business_id: "own-business", user_id: userId, role: "finance", display_name: "Finance teammate" });
    expect(mocks.generate).toHaveBeenCalledWith({ type: "invite", email: "staff@example.com" });
    const url = new URL(result.link!);
    expect(url.pathname).toBe("/signup");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(token);
  });
  it("rejects invalid input before provisioning", async () => {
    expect((await createInvitation(form({ email: "bad", name: "" }))).error).toBeTruthy();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not produce a link when membership provisioning fails", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    expect((await createInvitation(invitation())).link).toBeUndefined();
  });
  it("cannot reassign or promote an existing membership", async () => {
    mocks.member.mockResolvedValue({ data: { business_id: "other-business", role: "owner" }, error: null });
    expect((await createInvitation(invitation())).error).toBeTruthy();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("validates confirmation before consuming a token", async () => {
    const data = signup(); data.set("confirmation", "different");
    expect(await acceptInvitation(data)).toMatch(/match/i);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects invalid or consumed tokens without a matching authenticated identity", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "expired" }, data: { user: null } });
    expect(await acceptInvitation(signup())).toMatch(/invitation/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a token paired with a different user identifier", async () => {
    mocks.verify.mockResolvedValue({ error: null, data: { user: { id: "different-user" } } });
    expect(await acceptInvitation(signup())).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires a current finance membership before setting the password", async () => {
    expect(await acceptInvitation(signup())).toMatch(/access/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("allows a password-update retry only for the same authenticated invited user", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "consumed" }, data: { user: null } });
    mocks.user.mockResolvedValue({ data: { user: { id: userId, invited_at: "2026-10-27" } }, error: null });
    mocks.member.mockResolvedValue({ data: { role: "finance" }, error: null });
    expect(await acceptInvitation(signup())).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith({ password: "a-long-private-password" });
  });
  it("returns a retryable message if setting the password fails", async () => {
    mocks.member.mockResolvedValue({ data: { role: "finance" }, error: null });
    mocks.update.mockResolvedValue({ error: { message: "unavailable" } });
    expect(await acceptInvitation(signup())).toMatch(/try again/i);
  });
});
