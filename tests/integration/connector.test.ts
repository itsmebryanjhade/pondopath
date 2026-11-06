import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("Google Sheet connector storage and staging", () => {
  let business: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;
  let otherOwner: SupabaseClient;

  const newKey = () => randomBytes(32).toString("base64url");
  const hash = (key: string) => createHash("sha256").update(key).digest("hex");
  const settings = { spreadsheetId: "1eFBejjGY_nmLZs4IbLhv2QDhPyOU4cuoMzwTpRFoj", gid: "0", intervalMinutes: 10 };
  const headers = ["ID", "Invoice", "Amount", "Due"];

  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> {
    expect(result.error).toBeNull();
    return result as Extract<T, { error: null }>;
  }
  async function connect(client: SupabaseClient, key: string) {
    return checked(await client.rpc("create_sheet_connection", { p_label: "Fictional Sheet", p_settings: settings, p_key_hash: hash(key) })).data as string;
  }
  function ingest(sourceId: string, key: string, run: object) {
    return admin.rpc("connector_ingest", { p_source_id: sourceId, p_key: key, p_run: run });
  }
  const row = (fixture: TestBusiness, externalId: string, number: string) => ({
    externalId, sourceVersion: "v-" + number,
    candidate: { type: "save_invoice", payload: { number, customerId: fixture.customerId, amountCents: 125_000, dueDate: "2026-11-20" } },
    evidence: { via: "google_sheet_connector", runId: "fixture", sheetRow: 2, fields: { ID: externalId } },
  });
  async function activeConnection(client: SupabaseClient, fixture: TestBusiness) {
    const key = newKey();
    const sourceId = await connect(client, key);
    checked(await ingest(sourceId, key, { runId: randomUUID(), result: "first_read", counts: { read: 1 }, firstRead: { headers, samples: [["a", "GS-1", 1, 46346]] } }));
    checked(await client.rpc("save_connector_mapping", { p_source_id: sourceId, p_mapping: { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId: fixture.customerId } }));
    return { sourceId, key };
  }

  beforeAll(async () => {
    business = await createTestBusiness();
    other = await createTestBusiness();
    owner = await signInAs(business.accounts.owner);
    finance = await signInAs(business.accounts.finance);
    otherOwner = await signInAs(other.accounts.owner);
  });

  afterAll(async () => {
    await owner?.auth.signOut();
    await finance?.auth.signOut();
    await otherOwner?.auth.signOut();
    if (other) await disposeTestBusiness(other);
    if (business) await disposeTestBusiness(business);
  });

  it("lets only the owner create and manage a sheet connection", async () => {
    expect((await finance.rpc("create_sheet_connection", { p_label: "Finance Sheet", p_settings: settings, p_key_hash: hash(newKey()) })).error?.message).toBe("FORBIDDEN");
    const sourceId = await connect(owner, newKey());
    for (const [name, args] of [
      ["save_connector_mapping", { p_source_id: sourceId, p_mapping: { kind: "invoice" } }],
      ["set_connector_paused", { p_source_id: sourceId, p_paused: true }],
      ["replace_connector_key", { p_source_id: sourceId, p_key_hash: hash(newKey()) }],
      ["disconnect_connector", { p_source_id: sourceId }],
    ] as const) expect((await finance.rpc(name, args)).error?.message).toBe("FORBIDDEN");
    const source = checked(await finance.from("intake_sources").select("kind,connector_status,connector_settings").eq("id", sourceId).single()).data;
    expect(source).toMatchObject({ kind: "google_sheet", connector_status: "awaiting_first_read", connector_settings: settings });
    expect((await finance.from("intake_sources").select("connector_key_hash").eq("id", sourceId)).error).not.toBeNull();
  });

  it("rejects a wrong, replaced or disconnected key", async () => {
    const key = newKey();
    const sourceId = await connect(owner, key);
    expect((await admin.rpc("connector_source", { p_source_id: sourceId, p_key: newKey() })).error?.message).toBe("UNAUTHENTICATED");
    expect(checked(await admin.rpc("connector_source", { p_source_id: sourceId, p_key: key })).data).toMatchObject({ businessId: business.id, status: "awaiting_first_read" });
    const replacement = newKey();
    checked(await owner.rpc("replace_connector_key", { p_source_id: sourceId, p_key_hash: hash(replacement) }));
    expect((await admin.rpc("connector_source", { p_source_id: sourceId, p_key: key })).error?.message).toBe("UNAUTHENTICATED");
    checked(await admin.rpc("connector_source", { p_source_id: sourceId, p_key: replacement }));
    checked(await owner.rpc("disconnect_connector", { p_source_id: sourceId }));
    expect((await admin.rpc("connector_source", { p_source_id: sourceId, p_key: replacement })).error?.message).toBe("UNAUTHENTICATED");
  });

  it("is not callable by signed-in members", async () => {
    const { sourceId, key } = await activeConnection(owner, business);
    expect((await owner.rpc("connector_ingest", { p_source_id: sourceId, p_key: key, p_run: { runId: "x", result: "staged", counts: {}, rows: [] } })).error).not.toBeNull();
    expect((await owner.rpc("connector_source", { p_source_id: sourceId, p_key: key })).error).not.toBeNull();
  });

  it("stores first-read headers and moves to awaiting_mapping, then active after mapping", async () => {
    const key = newKey();
    const sourceId = await connect(owner, key);
    const run = checked(await ingest(sourceId, key, { runId: "first", result: "first_read", counts: { read: 1 }, firstRead: { headers, samples: [] } })).data;
    expect(run).toMatchObject({ replayed: false, result: "first_read" });
    let source = checked(await owner.from("intake_sources").select("connector_status,connector_settings").eq("id", sourceId).single()).data;
    expect(source.connector_status).toBe("awaiting_mapping");
    expect((source.connector_settings as { headers: string[] }).headers).toEqual(headers);
    expect(checked(await ingest(sourceId, key, { runId: "early", result: "staged", counts: {}, rows: [row(business, "a", "GS-EARLY")] })).data).toMatchObject({ result: "awaiting_mapping", results: [] });
    checked(await owner.rpc("save_connector_mapping", { p_source_id: sourceId, p_mapping: { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId: business.customerId } }));
    source = checked(await owner.from("intake_sources").select("connector_status,connector_settings").eq("id", sourceId).single()).data;
    expect(source.connector_status).toBe("active");
  });

  it("stages connector rows as pending without posting cash", async () => {
    const { sourceId, key } = await activeConnection(owner, business);
    const cashBefore = (await admin.from("cash_movements").select("id", { count: "exact", head: true }).eq("business_id", business.id)).count;
    const result = checked(await ingest(sourceId, key, { runId: "stage-1", result: "staged", counts: { read: 1, staged: 1 }, rows: [row(business, "a", "GS-STAGE")] })).data as { results: { itemId: string; status: string }[] };
    expect(result.results[0].status).toBe("pending");
    const item = checked(await admin.from("intake_items").select("status,staged_by,source_evidence").eq("id", result.results[0].itemId).single()).data;
    expect(item).toMatchObject({ status: "pending", staged_by: business.accounts.owner.id, source_evidence: { via: "google_sheet_connector" } });
    expect((await admin.from("cash_movements").select("id", { count: "exact", head: true }).eq("business_id", business.id)).count).toBe(cashBefore);
    const runs = checked(await finance.from("intake_connector_runs").select("run_id,result,counts").eq("source_id", sourceId)).data;
    expect(runs.map(run => run.run_id)).toContain("stage-1");
  });

  it("records a runId once even when sent twice or concurrently", async () => {
    const { sourceId, key } = await activeConnection(owner, business);
    const run = { runId: "same-run", result: "staged", counts: { read: 1, staged: 1 }, rows: [row(business, "c", "GS-CONCURRENT")] };
    const [first, second] = await Promise.all([ingest(sourceId, key, run), ingest(sourceId, key, run)]);
    expect([first.data?.replayed, second.data?.replayed].sort()).toEqual([false, true]);
    expect((await admin.from("intake_connector_runs").select("id", { count: "exact", head: true }).eq("source_id", sourceId).eq("run_id", "same-run")).count).toBe(1);
    expect((await admin.from("intake_items").select("id", { count: "exact", head: true }).eq("source_id", sourceId).eq("external_id", "c")).count).toBe(1);
  });

  it("refreshes stored headers after a mapped column is renamed, without changing status or mapping", async () => {
    const { sourceId, key } = await activeConnection(owner, business);
    const before = checked(await owner.from("intake_sources").select("mapping").eq("id", sourceId).single()).data;
    const renamed = ["ID", "Invoice no.", "Amount", "Due"];
    checked(await ingest(sourceId, key, { runId: "renamed", result: "failed", errorCode: "MAPPING_HEADER_MISSING", counts: { read: 1, missingHeaders: ["Invoice"] }, firstRead: { headers: renamed, samples: [] } }));
    const after = checked(await owner.from("intake_sources").select("connector_status,mapping,connector_settings").eq("id", sourceId).single()).data;
    expect(after.connector_status).toBe("active");
    expect(after.mapping).toEqual(before.mapping);
    expect((after.connector_settings as { headers: string[] }).headers).toEqual(renamed);
  });

  it("records paused reads without staging", async () => {
    const { sourceId, key } = await activeConnection(owner, business);
    checked(await owner.rpc("set_connector_paused", { p_source_id: sourceId, p_paused: true }));
    expect(checked(await ingest(sourceId, key, { runId: "paused", result: "staged", counts: {}, rows: [row(business, "p", "GS-PAUSED")] })).data).toMatchObject({ result: "paused", results: [] });
    expect((await admin.from("intake_items").select("id", { count: "exact", head: true }).eq("source_id", sourceId)).count).toBe(0);
  });

  it("never stages into another business with this business's key", async () => {
    const mine = await activeConnection(owner, business);
    const theirs = await activeConnection(otherOwner, other);
    expect((await ingest(theirs.sourceId, mine.key, { runId: "cross", result: "staged", counts: {}, rows: [row(other, "x", "GS-CROSS")] })).error?.message).toBe("UNAUTHENTICATED");
    expect((await admin.from("intake_items").select("id", { count: "exact", head: true }).eq("source_id", theirs.sourceId)).count).toBe(0);
  });

  it("records actual staging outcomes and replays those counts, including a pause race", async () => {
    const connection = await activeConnection(owner, business);
    const good = row(business, "count-good", "COUNT-GOOD");
    const bad = row(business, "count-bad", "COUNT-BAD");
    bad.candidate.payload.amountCents = 0;
    const counts = { read: 2, staged: 2, unchanged: 0, skippedByFilter: 0, invalid: [], missing: 0, morePending: false, seen: [] };
    const run = { runId: randomUUID(), result: "staged", counts, rows: [good, bad] };
    const result = checked(await ingest(connection.sourceId, connection.key, run));
    expect(result.data).toMatchObject({ result: "staged", replayed: false, counts: { staged: 1, invalid: [{ row: 2, reason: "This row needs attention. Review current records." }] } });
    const saved = checked(await owner.from("intake_connector_runs").select("counts").eq("source_id", connection.sourceId).eq("run_id", run.runId).single());
    expect(saved.data?.counts).toMatchObject({ staged: 1, invalid: [{ row: 2 }] });
    expect(checked(await ingest(connection.sourceId, connection.key, run)).data).toMatchObject({ replayed: true, counts: { staged: 1, invalid: [{ row: 2 }] } });
    checked(await owner.rpc("set_connector_paused", { p_source_id: connection.sourceId, p_paused: true }));
    expect(checked(await ingest(connection.sourceId, connection.key, { ...run, runId: randomUUID() })).data).toMatchObject({ result: "paused", counts: { staged: 0 } });
  });
});
