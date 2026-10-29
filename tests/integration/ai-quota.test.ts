import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonymous, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

let fixture: TestBusiness;
let owner: Awaited<ReturnType<typeof signInAs>>;
let finance: Awaited<ReturnType<typeof signInAs>>;
beforeAll(async () => { fixture = await createTestBusiness(); owner = await signInAs(fixture.accounts.owner); finance = await signInAs(fixture.accounts.finance); });
afterAll(async () => { if (fixture) await disposeTestBusiness(fixture); });
describe("atomic business AI allowance", () => {
  const args = { p_expected_revision: 0, p_model: "test-model", p_provider: "test-provider" };
  it("rejects anonymous calls, revision mismatch and direct counter writes", async () => {
    expect((await anonymous.rpc("reserve_ai_request", args)).error).not.toBeNull();
    expect((await owner.rpc("reserve_ai_request", { ...args, p_expected_revision: 99 })).error?.message).toContain("STALE_VERSION");
    expect((await finance.from("ai_usage").insert({ business_id: fixture.id, manila_date: "2026-10-29", request_count: 0 })).error).not.toBeNull();
  });
  it("caps simultaneous owner/finance requests and cannot be reset through browser arguments", async () => {
    await admin.from("businesses").update({ ai_daily_limit: 2 }).eq("id", fixture.id);
    const results = await Promise.all([owner, finance, owner, finance].map(client => client.rpc("reserve_ai_request", args)));
    expect(results.filter(row => !row.error)).toHaveLength(2);
    expect(results.filter(row => row.error?.message.includes("AI_LIMIT"))).toHaveLength(2);
    const usage = await owner.from("ai_usage").select("request_count").eq("business_id", fixture.id);
    expect(usage.data?.[0].request_count).toBe(2);
  });
});
