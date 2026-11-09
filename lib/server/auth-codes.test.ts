import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
  membership: { data: null as { business_id: string } | null, error: null as unknown },
  cookieSet: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { signUp: mocks.signUp, verifyOtp: mocks.verifyOtp, resend: mocks.resend, resetPasswordForEmail: mocks.resetPasswordForEmail, updateUser: mocks.updateUser, signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  from: () => ({ select: () => ({ maybeSingle: async () => mocks.membership }) }),
}) }));
import { finishPasswordReset, resendCode, signInWithPassword, startPasswordReset, startSignup, verifyCode } from "./auth-codes";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const goodSignup = { email: "Owner@Fictional.Example", password: "a-long-fictional-pass", confirmation: "a-long-fictional-pass" };
const redirected = async (work: Promise<unknown>) => { try { await work; return null; } catch (error) { return error instanceof Error ? error.message : "other"; } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.membership = { data: null, error: null };
  mocks.signUp.mockResolvedValue({ data: { session: null, user: { id: "u" } }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" }, user: { id: "u" } }, error: null });
  mocks.resend.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
});

describe("sign-up with an emailed code", () => {
  it("identifies the field to fix before asking Supabase", async () => {
    const cases = [
      { input: { password: "short", confirmation: "short" }, field: "password", message: /at least 12 characters/ },
      { input: { confirmation: "different-fictional-pass" }, field: "confirmation", message: /passwords don.t match/i },
      { input: { email: "not-an-email" }, field: "email", message: /valid email address/i },
    ];
    for (const { input, field, message } of cases) {
      expect(await startSignup(form({ ...goodSignup, ...input }))).toMatchObject({ step: "details", field, message: expect.stringMatching(message) });
    }
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("reports a failed signup email without advancing to the code step", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: {
      name: "AuthRetryableFetchError", message: "Error sending confirmation email", status: 500,
    } });
    expect(await startSignup(form(goodSignup))).toMatchObject({
      step: "details", message: expect.stringMatching(/couldn.t send a confirmation code/i),
    });
  });
  it("moves to the code step with a lower-cased email when a confirmation code was sent", async () => {
    expect(await startSignup(form(goodSignup))).toEqual({ step: "code", email: "owner@fictional.example", message: null });
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "owner@fictional.example", password: goodSignup.password });
  });
  it("continues straight to setup when Supabase signs the user in immediately", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "t" }, user: { id: "u" } }, error: null });
    expect(await redirected(startSignup(form(goodSignup)))).toBe("REDIRECT:/setup");
  });
  it("shows a generic failure, or a wait message when rate limited, and never leaks provider text", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "User already registered: secret detail", status: 422 } });
    const failed = await startSignup(form(goodSignup));
    expect(failed.step).toBe("details");
    expect(failed.message).not.toMatch(/secret|registered/i);
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "x", status: 429, code: "over_email_send_rate_limit" } });
    expect((await startSignup(form(goodSignup))).message).toMatch(/wait/i);
  });
});

describe("verifying the code", () => {
  it("rejects a code that is not six digits without calling Supabase", async () => {
    for (const token of ["12345", "abcdef", "1234567", ""]) expect(await verifyCode("signup", form({ email: "a@b.example", token }))).toMatch(/6-digit/);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("accepts spaces in a pasted code and sends a new owner to setup", async () => {
    expect(await redirected(verifyCode("signup", form({ email: "A@B.example", token: "123 456" })))).toBe("REDIRECT:/setup");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "a@b.example", token: "123456", type: "signup" });
  });
  it("sends an existing member to the overview and sets the one-time welcome notice", async () => {
    mocks.membership = { data: { business_id: "b" }, error: null };
    expect(await redirected(verifyCode("signup", form({ email: "a@b.example", token: "123456" })))).toBe("REDIRECT:/overview");
    expect(mocks.cookieSet).toHaveBeenCalled();
  });
  it("gives one plain message for a wrong or expired code", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "Token has expired or is invalid", status: 403 } });
    expect(await verifyCode("signup", form({ email: "a@b.example", token: "123456" }))).toMatch(/didn.t work or has expired/);
  });
});

describe("resending a code", () => {
  it("asks Supabase for a new signup code and always returns the same friendly message", async () => {
    expect(await resendCode("signup", "A@B.example")).toMatch(/new code/i);
    expect(mocks.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.example" });
    mocks.resend.mockResolvedValue({ error: { message: "no such user", status: 400 } });
    expect(await resendCode("signup", "a@b.example")).toMatch(/new code/i);
  });
  it("tells the person to wait when rate limited and ignores invalid emails", async () => {
    mocks.resend.mockResolvedValue({ error: { message: "x", status: 429 } });
    expect(await resendCode("signup", "a@b.example")).toMatch(/wait/i);
    mocks.resend.mockClear();
    expect(await resendCode("signup", "nope")).toMatch(/valid email/i);
    expect(mocks.resend).not.toHaveBeenCalled();
  });
  it("uses the password-reset request for recovery codes", async () => {
    await resendCode("recovery", "a@b.example");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("a@b.example");
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  it("shows the same code step whether or not the account exists", async () => {
    const found = await startPasswordReset(form({ email: "a@b.example" }));
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found", status: 400 } });
    const missing = await startPasswordReset(form({ email: "a@b.example" }));
    expect(found).toEqual(missing);
    expect(found.step).toBe("code");
  });
  it("asks for a valid email first", async () => {
    expect((await startPasswordReset(form({ email: "nope" }))).step).toBe("details");
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("checks the new password and code before verifying", async () => {
    const base = { email: "a@b.example", token: "123456", password: "a-long-fictional-pass", confirmation: "a-long-fictional-pass" };
    expect(await finishPasswordReset(form({ ...base, password: "short", confirmation: "short" }))).toMatch(/12 characters/);
    expect(await finishPasswordReset(form({ ...base, confirmation: "other-fictional-password" }))).toMatch(/match/);
    expect(await finishPasswordReset(form({ ...base, token: "12" }))).toMatch(/6-digit/);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("saves the new password only after the code is verified, then lands in the workspace", async () => {
    mocks.membership = { data: { business_id: "b" }, error: null };
    const base = { email: "a@b.example", token: "123456", password: "a-long-fictional-pass", confirmation: "a-long-fictional-pass" };
    expect(await redirected(finishPasswordReset(form(base)))).toBe("REDIRECT:/overview");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "a@b.example", token: "123456", type: "recovery" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: base.password });
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
  });
  it("does not change the password when the code is wrong", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "bad", status: 403 } });
    const result = await finishPasswordReset(form({ email: "a@b.example", token: "123456", password: "a-long-fictional-pass", confirmation: "a-long-fictional-pass" }));
    expect(result).toMatch(/didn.t work or has expired/);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("signing in with a password", () => {
  it("sends a fresh code and asks for it when the email was never confirmed", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Email not confirmed", code: "email_not_confirmed", status: 400 } });
    expect(await signInWithPassword(form({ email: "A@B.example", password: "whatever-fictional-pass" }))).toEqual({ message: null, confirmEmail: "a@b.example" });
    expect(mocks.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.example" });
  });
  it("offers the same recovery path for wrong passwords and unknown accounts", async () => {
    const details = form({ email: "a@b.example", password: "whatever-fictional-pass" });
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 } });
    const result = await signInWithPassword(details);
    expect(result).toEqual({ message: expect.stringMatching(/check your email and password/i), confirmEmail: null });
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: "Account does not exist", code: "user_not_found", status: 400 } });
    expect(await signInWithPassword(details)).toEqual(result);
  });

  it("separates temporary service errors and rate limits from wrong credentials", async () => {
    const details = form({ email: "a@b.example", password: "whatever-fictional-pass" });
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { name: "AuthRetryableFetchError", message: "internal service details", status: 503 } });
    expect(await signInWithPassword(details)).toEqual({ message: expect.stringMatching(/temporarily unavailable/i), confirmEmail: null });
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { code: "over_request_rate_limit", status: 429 } });
    expect(await signInWithPassword(details)).toEqual({ message: expect.stringMatching(/too many sign-in attempts/i), confirmEmail: null });
  });

  it("reports a failed resend and still accepts a code the user already received", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed", status: 400 } });
    mocks.resend.mockResolvedValueOnce({ error: { name: "AuthRetryableFetchError", status: 500 } });
    const details = form({ email: "a@b.example", password: "whatever-fictional-pass" });
    expect(await signInWithPassword(details)).toEqual({ message: expect.stringMatching(/couldn.t send a new code/i), confirmEmail: "a@b.example" });
  });
  it("routes a member to the overview and a new account to setup", async () => {
    mocks.membership = { data: { business_id: "b" }, error: null };
    expect(await redirected(signInWithPassword(form({ email: "a@b.example", password: "whatever-fictional-pass" })))).toBe("REDIRECT:/overview");
    mocks.membership = { data: null, error: null };
    expect(await redirected(signInWithPassword(form({ email: "a@b.example", password: "whatever-fictional-pass" })))).toBe("REDIRECT:/setup");
  });
});
