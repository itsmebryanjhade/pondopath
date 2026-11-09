import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  actor: { userId: "40000000-0000-4000-8000-000000000001", businessId: "10000000-0000-4000-8000-000000000001", role: "finance" as "owner" | "finance" },
  sources: {} as Record<string, { businessId: string; status: string; fileId: string; tab: string | null }>,
  claimDue: [] as string[], claimSource: true, adminRpc: vi.fn(), token: vi.fn(), fileInfo: vi.fn(), readFile: vi.fn(), ingest: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireActor: async () => state.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.adminRpc }) }));
vi.mock("@/lib/server/google-files", () => ({ businessAccessToken: state.token }));
vi.mock("@/lib/server/google", () => ({ fileInfo: state.fileInfo, readFile: state.readFile }));
vi.mock("@/lib/server/connector-intake", () => ({ ingestGoogleRead: state.ingest }));
import { syncBusinessIfDue, syncDue, syncNow } from "./google-sync";
import { POST } from "@/app/api/intake/google/sync/route";

const a = "20000000-0000-4000-8000-00000000000a", b = "20000000-0000-4000-8000-00000000000b";
const secret = "fictional-cron-secret-with-at-least-32-characters";
const read = { headers: ["ID"], rows: [["x"]], rowNumbers: [2] };

beforeEach(() => {
  vi.stubEnv("GOOGLE_SYNC_CRON_SECRET", secret);
  state.actor.role = "finance";
  state.sources = {
    [a]: { businessId: state.actor.businessId, status: "active", fileId: "fileA1234567", tab: "Sales" },
    [b]: { businessId: "10000000-0000-4000-8000-000000000002", status: "active", fileId: "fileB1234567", tab: null },
  };
  state.claimDue = [a, b]; state.claimSource = true;
  state.adminRpc.mockReset().mockImplementation(async (name: string, args: { p_source_id?: string }) => {
    if (name === "google_file_source") return state.sources[args.p_source_id!] ? { data: state.sources[args.p_source_id!], error: null } : { data: null, error: { message: "UNAUTHENTICATED" } };
    if (name === "google_claim_due") return { data: state.claimDue, error: null };
    if (name === "google_claim_source") return { data: state.claimSource, error: null };
    return { data: null, error: null };
  });
  state.token.mockReset().mockResolvedValue("access");
  state.fileInfo.mockReset().mockImplementation(async (_token: string, fileId: string) => ({ id: fileId, name: "F", mimeType: "text/csv", size: 10, trashed: false }));
  state.readFile.mockReset().mockResolvedValue({ tabs: [], tab: null, read });
  state.ingest.mockReset().mockImplementation(async (_id: string, input: { error?: string }) => input.error ? { result: "failed", errorCode: input.error } : { result: "staged", staged: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("cron route", () => {
  const call = (authorization?: string) => POST(new Request("http://localhost:3000/api/intake/google/sync", { method: "POST", headers: authorization ? { authorization } : {} }));
  it("refuses a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-wrong-secret-wrong-secret-xx")).status).toBe(401);
    expect(state.adminRpc).not.toHaveBeenCalled();
  });
  it("syncs due files and answers with counts only", async () => {
    const response = await call("Bearer " + secret);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, synced: 2, failed: 0 });
  });
  it("refuses everything when no secret is configured", async () => {
    vi.stubEnv("GOOGLE_SYNC_CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });
});

describe("syncing", () => {
  it("continues after one file fails and records each file's own error", async () => {
    state.token.mockImplementation(async (businessId: string) => { if (businessId === state.actor.businessId) throw new Error("GOOGLE_RECONNECT"); return "access"; });
    expect(await syncDue(5)).toEqual({ synced: 1, failed: 1 });
    expect(state.ingest).toHaveBeenCalledWith(a, expect.objectContaining({ error: "GOOGLE_RECONNECT" }));
    expect(state.ingest).toHaveBeenCalledWith(b, expect.objectContaining({ headers: ["ID"] }));
  });
  it("records lost access without staging and keeps going", async () => {
    state.fileInfo.mockRejectedValueOnce(new Error("FILE_ACCESS_LOST"));
    expect(await syncDue(5)).toEqual({ synced: 1, failed: 1 });
    expect(state.ingest.mock.calls[0][1]).toMatchObject({ error: "FILE_ACCESS_LOST" });
    expect(state.ingest.mock.calls[0][1]).not.toHaveProperty("rows");
  });
  it("Sync now is open to owner and finance, refuses other businesses and respects the lease", async () => {
    expect(await syncNow(a)).toMatchObject({ result: "staged" });
    state.actor.role = "owner";
    expect(await syncNow(a)).toMatchObject({ result: "staged" });
    await expect(syncNow(b)).rejects.toThrow("NOT_FOUND");
    state.claimSource = false;
    await expect(syncNow(a)).rejects.toThrow("SYNC_IN_PROGRESS");
  });
  it("the inbox-open sync never throws", async () => {
    state.adminRpc.mockRejectedValue(new Error("database down"));
    await expect(syncBusinessIfDue(state.actor.businessId)).resolves.toBeUndefined();
  });
  it("never logs tokens or row content", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    state.readFile.mockRejectedValueOnce(new Error("FILE_UNREADABLE"));
    await syncDue(5);
    expect(JSON.stringify([...spy.mock.calls, ...log.mock.calls])).not.toMatch(/access|"x"/);
    spy.mockRestore(); log.mockRestore();
  });
});
