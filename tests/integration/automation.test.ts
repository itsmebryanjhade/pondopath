import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anonymous, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("missed-commitment workflow on the development database", () => {
  let fixture: TestBusiness, other: TestBusiness, member: SupabaseClient;
  const expectationId = randomUUID();
  const checked = <T extends { error: unknown }>(result: T): T => { expect(result.error).toBeNull(); return result; };
  const invoke = (request: object, business = fixture.id) => admin.rpc("automation_followups", { p_business_id: business, p_request: request });
  const scan = async () => checked(await invoke({ operation: "scan" })).data;
  const create = (runId: string, ids = [expectationId]) => invoke({ operation: "create", runId, expectationIds: ids });
  beforeAll(async () => {
    fixture = await createTestBusiness(); other = await createTestBusiness();
    member = await signInAs(fixture.accounts.finance);
  });
  beforeEach(async () => {
    if (fixture.name !== "test-" + fixture.id) throw new Error("Refusing non-fixture reset");
    for (const table of ["audit_events", "followups", "expectations", "automation_runs", "cash_movements"]) checked(await admin.from(table).delete().eq("business_id", fixture.id));
    checked(await admin.from("expectations").insert({ id: expectationId, business_id: fixture.id, invoice_id: fixture.invoiceId, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-10-28", kind: "commitment", state: "active", source_note: "Fictional confirmed date", confirmed_by: fixture.accounts.finance.id }));
  });
  afterAll(async () => { if (fixture) await disposeTestBusiness(fixture); if (other) await disposeTestBusiness(other); });
  it("limits automation RPC access and scans only passed active confirmed commitments", async () => {
    expect((await anonymous.rpc("automation_followups", { p_business_id: fixture.id, p_request: { operation: "scan" } })).error).not.toBeNull();
    expect((await member.rpc("automation_followups", { p_business_id: fixture.id, p_request: { operation: "scan" } })).error).not.toBeNull();
    expect((await scan()).candidates).toEqual([{ expectationId, remainingCents: 5_000_000, date: "2026-10-28" }]);
    for (const change of [{ expected_date: "2026-10-29" }, { expected_date: "2026-10-30" }, { kind: "assumption" }, { state: "fulfilled" }, { state: "superseded" }, { state: "needs_review" }, { remaining_cents: 0 }]) {
      checked(await admin.from("expectations").update({ kind: "commitment", state: "active", remaining_cents: 5_000_000, expected_date: "2026-10-28", ...change }).eq("id", expectationId));
      expect((await scan()).candidates).toEqual([]);
    }
  });
  it("rechecks changed expectations and binds create/finish to the original business and scan", async () => {
    const run = await scan();
    expect((await create(run.runId, [randomUUID()])).error).not.toBeNull();
    expect((await invoke({ operation: "finish", runId: run.runId, success: true })).error).not.toBeNull();
    expect((await invoke({ operation: "create", runId: run.runId, expectationIds: [expectationId] }, other.id)).error).not.toBeNull();
    checked(await admin.from("expectations").update({ state: "needs_review" }).eq("id", expectationId));
    expect(checked(await create(run.runId)).data).toEqual({ created: 0, existing: 0, skipped: 1 });
    expect(checked(await invoke({ operation: "finish", runId: run.runId, success: true })).data).toEqual({ completed: true });
    expect((await admin.from("followups").select("id").eq("business_id", fixture.id)).data).toEqual([]);
  });
  it("skips fulfilled and superseded commitments changed after scanning", async () => {
    const run = await scan();
    for (const state of ["fulfilled", "superseded"]) {
      checked(await admin.from("expectations").update({ state }).eq("id", expectationId));
      expect(checked(await create(run.runId)).data).toEqual({ created: 0, existing: 0, skipped: 1 });
    }
  });
  it("handles concurrent and repeated creation without reopening human-completed tasks", async () => {
    const run = await scan();
    const results = await Promise.all([create(run.runId), create(run.runId)]);
    results.forEach(checked);
    expect(results.map(result => result.data.created).sort()).toEqual([0, 1]);
    const tasks = checked(await admin.from("followups").select("*").eq("business_id", fixture.id)).data!;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assignee_id: fixture.accounts.finance.id, automatic_type: "missed_commitment", due_date: "2026-10-29", state: "open" });
    checked(await admin.from("followups").update({ state: "completed", completion_source: "human", completed_at: new Date().toISOString(), outcome: "Customer contacted" }).eq("id", tasks[0].id));
    expect(checked(await create(run.runId)).data).toEqual({ created: 0, existing: 1, skipped: 0 });
    expect((await admin.from("followups").select("state").eq("id", tasks[0].id)).data?.[0].state).toBe("completed");
    checked(await invoke({ operation: "finish", runId: run.runId, success: true }));
    expect((await create(run.runId)).error).not.toBeNull();
  });
  it("uses the same rules for member fallback without masking scheduled downtime", async () => {
    expect((await anonymous.rpc("check_missed_commitments")).error).not.toBeNull();
    expect(checked(await member.rpc("check_missed_commitments")).data).toEqual({ created: 1, existing: 0, skipped: 0 });
    expect(checked(await member.rpc("check_missed_commitments")).data).toEqual({ created: 0, existing: 1, skipped: 0 });
    const status = checked(await member.rpc("workspace_snapshot")).data.automation;
    expect(status).toMatchObject({ stale: true, lastSuccessAt: null, lastAttemptAt: null });
    expect(status.lastManualAt).toBeTruthy();
    expect(checked(await admin.from("cash_movements").select("id").eq("business_id", fixture.id)).data).toEqual([]);
  });
  it("records failure, catches up after interruption, and skips a commitment fulfilled by a receipt", async () => {
    const interrupted = await scan();
    checked(await admin.from("automation_runs").update({ started_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("business_id", fixture.id).eq("run_id", interrupted.runId));
    const retry = await scan();
    expect((await admin.from("automation_runs").select("status,error_code").eq("run_id", interrupted.runId)).data?.[0]).toMatchObject({ status: "failed", error_code: "INTERRUPTED" });
    checked(await invoke({ operation: "finish", runId: retry.runId, success: false, errorCode: "HTTP_ERROR" }));
    const snapshot = checked(await member.rpc("workspace_snapshot")).data;
    expect(snapshot.automation).toMatchObject({ stale: true, lastStatus: "failed", lastErrorCode: "HTTP_ERROR" });
    const finalRun = await scan();
    checked(await callCommand(member, { requestId: randomUUID(), expectedRevision: snapshot.revision, type: "post_cash_movement", payload: { kind: "receipt", parentId: fixture.invoiceId, amountCents: 5_000_000, date: "2026-10-29", reference: "Automation test receipt" } }));
    expect(checked(await create(finalRun.runId)).data).toEqual({ created: 0, existing: 0, skipped: 1 });
    checked(await invoke({ operation: "finish", runId: finalRun.runId, success: true }));
    expect(checked(await member.rpc("workspace_snapshot")).data.automation).toMatchObject({ stale: false, lastStatus: "success", lastErrorCode: null });
  });
  it("rejects an oversized scan explicitly and records its failure", async () => {
    const invoiceRows = Array.from({ length: 1000 }, (_, index) => ({ id: randomUUID(), business_id: fixture.id, customer_id: fixture.customerId, number: `LIMIT-${index}`, amount_cents: 100, due_date: "2026-10-28" }));
    checked(await admin.from("invoices").insert(invoiceRows));
    checked(await admin.from("expectations").insert(invoiceRows.map(invoice => ({ business_id: fixture.id, invoice_id: invoice.id, amount_cents: 100, remaining_cents: 100, expected_date: "2026-10-28", kind: "commitment", source_note: "Isolated limit fixture", confirmed_by: fixture.accounts.owner.id }))));
    expect(await scan()).toEqual({ errorCode: "LIMIT_REACHED" });
    expect((await admin.from("automation_runs").select("status,error_code").eq("business_id", fixture.id)).data?.[0]).toMatchObject({ status: "failed", error_code: "LIMIT_REACHED" });
  });
});
