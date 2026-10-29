import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { POST } from "@/app/api/automation/followups/route";

const token = "test-only-automation-token-32-characters";
function request(body: unknown, authorization: string | null = `Bearer ${token}`) {
  return new Request("http://localhost/api/automation/followups", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTOMATION_TOKEN", token);
  vi.stubEnv("AUTOMATION_BUSINESS_ID", "10000000-0000-4000-8000-000000000001");
  mocks.rpc.mockResolvedValue({ data: { runId: randomUUID(), referenceDate: "2026-10-29", candidates: [] }, error: null });
});
describe("token-only limited automation endpoint", () => {
  it("rejects missing/wrong credentials before any database access", async () => {
    for (const credential of [null, "Bearer wrong", `Basic ${token}`]) expect((await POST(request({ operation: "scan" }, credential))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fixes scope on the server and rejects financial writes, approvals, caller scope and extra keys", async () => {
    expect((await POST(request({ operation: "scan" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("automation_followups", { p_business_id: process.env.AUTOMATION_BUSINESS_ID, p_request: { operation: "scan" } });
    for (const body of [{ operation: "post_cash_movement" }, { operation: "approve_reminder" }, { operation: "scan", businessId: randomUUID() }, { operation: "create", runId: randomUUID(), expectationIds: Array.from({ length: 1001 }, randomUUID) }]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("limits actual body bytes even without a Content-Length header", async () => {
    expect((await POST(request({ operation: "scan", text: "₱".repeat(24_000) }))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on missing configuration and reports bounded server errors", async () => {
    vi.stubEnv("AUTOMATION_TOKEN", "");
    expect((await POST(request({ operation: "scan" }))).status).toBe(503);
    vi.stubEnv("AUTOMATION_TOKEN", token);
    mocks.rpc.mockResolvedValue({ data: { errorCode: "LIMIT_REACHED" }, error: null });
    expect((await POST(request({ operation: "scan" }))).status).toBe(409);
    mocks.rpc.mockResolvedValue({ error: { message: "secret database details" } });
    const failed = await POST(request({ operation: "scan" }));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret database details");
  });
});
