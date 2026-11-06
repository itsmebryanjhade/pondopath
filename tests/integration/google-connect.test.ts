import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("Connect Google storage and the server-only Google door", () => {
  let business: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;
  let otherOwner: SupabaseClient;
  const sealed = "v1.fictional-nonce.fictional-ciphertext";
  const settings = (fileId: string) => ({ fileId, name: "Fictional ledger", mimeType: "application/vnd.google-apps.spreadsheet", tab: "Sheet1" });
  const fileId = () => "file" + randomBytes(8).toString("hex");

  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> {
    expect(result.error).toBeNull();
    return result as Extract<T, { error: null }>;
  }
  async function connectGoogle(fixture: TestBusiness) {
    checked(await admin.rpc("google_connection_save", { p_business: fixture.id, p_owner: fixture.accounts.owner.id, p_email: "owner@fictional.example",
      p_sealed: sealed, p_scopes: ["openid", "https://www.googleapis.com/auth/drive.file"] }));
  }
  async function activeFile(client: SupabaseClient, fixture: TestBusiness) {
    const sourceId = checked(await client.rpc("create_google_file_connection", { p_label: "Fictional ledger", p_settings: settings(fileId()) })).data as string;
    checked(await admin.rpc("google_file_ingest", { p_source_id: sourceId, p_run: { runId: randomUUID(), result: "first_read", counts: { read: 1 }, firstRead: { headers: ["ID", "Amount"], samples: [] } } }));
    checked(await client.rpc("save_connector_mapping", { p_source_id: sourceId, p_mapping: { kind: "auto", externalId: "ID", amount: "Amount", dueDate: "Due", number: "ID",
      customerId: fixture.customerId, label: "ID", payee: "ID", columns: ["ID", "Amount", "Due"], excludedIds: [], overrides: {} } }));
    return sourceId;
  }

  beforeAll(async () => {
    business = await createTestBusiness();
    other = await createTestBusiness();
    owner = await signInAs(business.accounts.owner);
    finance = await signInAs(business.accounts.finance);
    otherOwner = await signInAs(other.accounts.owner);
    await connectGoogle(business);
  });

  afterAll(async () => {
    await owner?.auth.signOut();
    await finance?.auth.signOut();
    await otherOwner?.auth.signOut();
    if (other) await disposeTestBusiness(other);
    if (business) await disposeTestBusiness(business);
  });

  it("members can read the connection but never the sealed token", async () => {
    for (const client of [owner, finance]) {
      const row = checked(await client.from("google_connections").select("account_email,status").eq("business_id", business.id).single()).data;
      expect(row).toEqual({ account_email: "owner@fictional.example", status: "connected" });
      expect((await client.from("google_connections").select("refresh_token_sealed")).error).not.toBeNull();
    }
    expect(checked(await otherOwner.from("google_connections").select("business_id").eq("business_id", business.id)).data).toEqual([]);
  });

  it("authenticated users cannot call the service_role functions", async () => {
    const calls: [string, object][] = [
      ["google_connection_save", { p_business: business.id, p_owner: business.accounts.owner.id, p_email: "x@fictional.example", p_sealed: sealed, p_scopes: [] }],
      ["google_connection_status", { p_business: business.id, p_status: "needs_reconnect" }],
      ["google_connection_token", { p_business: business.id }],
      ["google_file_source", { p_source_id: randomUUID() }],
      ["google_file_ingest", { p_source_id: randomUUID(), p_run: {} }],
      ["google_claim_due", { p_limit: 5 }],
      ["google_claim_source", { p_source_id: randomUUID() }],
    ];
    for (const [name, args] of calls) expect((await owner.rpc(name, args)).error?.code).toBe("42501");
  });

  it("only owners create file connections, and a file can be connected once", async () => {
    const id = fileId();
    expect((await finance.rpc("create_google_file_connection", { p_label: "Fictional", p_settings: settings(id) })).error?.message).toBe("FORBIDDEN");
    expect((await otherOwner.rpc("create_google_file_connection", { p_label: "Fictional", p_settings: settings(id) })).error?.message).toBe("GOOGLE_RECONNECT");
    checked(await owner.rpc("create_google_file_connection", { p_label: "Fictional", p_settings: settings(id) }));
    expect((await owner.rpc("create_google_file_connection", { p_label: "Fictional", p_settings: settings(id) })).error?.message).toBe("DUPLICATE_REFERENCE");
    expect((await owner.rpc("create_google_file_connection", { p_label: "Fictional", p_settings: { ...settings(fileId()), mimeType: "application/pdf" } })).error?.message).toBe("VALIDATION_ERROR");
  });

  it("each door only accepts its own connector kind", async () => {
    const driveSource = await activeFile(owner, business);
    const key = randomBytes(32).toString("base64url");
    const sheetSource = checked(await owner.rpc("create_sheet_connection", { p_label: "Fictional Sheet",
      p_settings: { spreadsheetId: "1eFBejjGY_nmLZs4IbLhv2QDhPyOU4cuoMzwTpRFoj", gid: "0", intervalMinutes: 10 },
      p_key_hash: createHash("sha256").update(key).digest("hex") })).data as string;
    const run = { runId: randomUUID(), result: "staged", counts: { read: 0 } };
    expect((await admin.rpc("google_file_ingest", { p_source_id: sheetSource, p_run: run })).error?.message).toBe("UNAUTHENTICATED");
    expect((await admin.rpc("connector_ingest", { p_source_id: driveSource, p_key: key, p_run: run })).error?.message).toBe("UNAUTHENTICATED");
    const source = checked(await admin.rpc("google_file_source", { p_source_id: driveSource })).data as Record<string, unknown>;
    expect(source).toMatchObject({ businessId: business.id, status: "active", googleStatus: "connected", tab: "Sheet1" });
    expect(JSON.stringify(source)).not.toContain(sealed);
  });

  it("claims honour the 10-minute due time and the 3-minute lease, and ingest releases the lease", async () => {
    const sourceId = await activeFile(owner, business);
    // The first read just ran; backdate it so the file is due.
    checked(await admin.from("intake_sources").update({ last_run_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("id", sourceId));
    const claimed = checked(await admin.rpc("google_claim_due", { p_limit: 20, p_business: business.id })).data as string[];
    expect(claimed).toContain(sourceId);
    expect(checked(await admin.rpc("google_claim_due", { p_limit: 20, p_business: business.id })).data as string[]).not.toContain(sourceId);
    expect(checked(await admin.rpc("google_claim_source", { p_source_id: sourceId })).data).toBe(false);
    checked(await admin.rpc("google_file_ingest", { p_source_id: sourceId, p_run: { runId: randomUUID(), result: "staged", counts: { read: 0 } } }));
    expect(checked(await admin.rpc("google_claim_source", { p_source_id: sourceId })).data).toBe(true);
    checked(await admin.rpc("google_file_ingest", { p_source_id: sourceId, p_run: { runId: randomUUID(), result: "staged", counts: { read: 0 } } }));
    // Just synced, so not due again for 10 minutes.
    expect(checked(await admin.rpc("google_claim_due", { p_limit: 20, p_business: business.id })).data as string[]).not.toContain(sourceId);
  });

  it("pause, resume and disconnect work for a Drive file; replacing a key does not", async () => {
    const sourceId = await activeFile(owner, business);
    checked(await owner.rpc("set_connector_paused", { p_source_id: sourceId, p_paused: true }));
    checked(await owner.rpc("set_connector_paused", { p_source_id: sourceId, p_paused: false }));
    expect((await owner.rpc("replace_connector_key", { p_source_id: sourceId, p_key_hash: "a".repeat(64) })).error?.message).toBe("VALIDATION_ERROR");
    checked(await owner.rpc("disconnect_connector", { p_source_id: sourceId }));
    expect(checked(await owner.from("intake_sources").select("connector_status").eq("id", sourceId).single()).data.connector_status).toBe("disconnected");
  });

  it("the token is only handed out while connected, and disconnect_google keeps history", async () => {
    expect(checked(await admin.rpc("google_connection_token", { p_business: business.id })).data).toBe(sealed);
    checked(await admin.rpc("google_connection_status", { p_business: business.id, p_status: "needs_reconnect" }));
    expect((await admin.rpc("google_connection_token", { p_business: business.id })).error?.message).toBe("GOOGLE_RECONNECT");
    await connectGoogle(business);
    const sourceId = await activeFile(owner, business);
    expect((await finance.rpc("disconnect_google")).error?.message).toBe("FORBIDDEN");
    checked(await owner.rpc("disconnect_google"));
    const connection = checked(await admin.from("google_connections").select("status,refresh_token_sealed").eq("business_id", business.id).single()).data;
    expect(connection).toEqual({ status: "disconnected", refresh_token_sealed: null });
    expect(checked(await owner.from("intake_sources").select("connector_status").eq("id", sourceId).single()).data.connector_status).toBe("disconnected");
    expect(checked(await owner.from("intake_connector_runs").select("id").eq("source_id", sourceId)).data.length).toBeGreaterThan(0);
  });
});
