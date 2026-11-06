import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ role: "owner", rpc: vi.fn(), sources: [] as Record<string, unknown>[], customers: [] as Record<string, unknown>[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireActor: async () => ({ role: mocks.role, userId: "10000000-0000-4000-8000-000000000001", businessId: "10000000-0000-4000-8000-000000000002" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: mocks.rpc, from: (table: string) => {
    const filters: [string, unknown][] = [];
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: (table === "customers" ? mocks.customers : mocks.sources).find(row => filters.every(([key, value]) => row[key] === value)) ?? null, error: null }),
    };
    return query;
  },
}) }));
import { createSheetConnectionAction, saveConnectorMappingAction, setConnectorPausedAction, replaceConnectorKeyAction, disconnectConnectorAction } from "@/app/(workspace)/imports/connector-actions";
const sourceId = "20000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const url = "https://docs.google.com/spreadsheets/d/1eFBejjGY_nmLZs4IbLhv2QDhPyOU4cuoMzwTpRFojw8/edit#gid=42";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "robot@fictional.example"); mocks.role = "owner"; mocks.rpc.mockResolvedValue({ data: sourceId, error: null }); mocks.sources = [{ id: sourceId, kind: "google_sheet", business_id: "10000000-0000-4000-8000-000000000002", connector_settings: { headers: ["ID", "Number", "Amount", "Due"] } }]; mocks.customers = [{ id: customerId, business_id: "10000000-0000-4000-8000-000000000002" }]; });
describe("owner-only connector actions", () => {
  it("stores the selected Sheet and tab, sends only a key hash, and returns a new key once", async () => {
    const result = await createSheetConnectionAction(" Fictional ", url);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Setup failed");
    expect(result.data.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("create_sheet_connection", { p_label: "Fictional", p_settings: { spreadsheetId: "1eFBejjGY_nmLZs4IbLhv2QDhPyOU4cuoMzwTpRFojw8", gid: "42", intervalMinutes: 10 }, p_key_hash: createHash("sha256").update(result.data.key).digest("hex") });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(result.data.key);
  });
  it("rejects every finance mutation on the server", async () => {
    mocks.role = "finance";
    const results = await Promise.all([createSheetConnectionAction("Sheet", url), saveConnectorMappingAction(sourceId, {}), setConnectorPausedAction(sourceId, true), replaceConnectorKeyAction(sourceId), disconnectConnectorAction(sourceId)]);
    expect(results.every(result => !result.ok && result.code === "FORBIDDEN")).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects untrusted URLs, missing setup and invalid runtime arguments", async () => {
    for (const value of [url.replace("docs.google.com", "evil.example"), url.replace("https:", "http:"), url.replace("gid=42", "gid=evil")]) expect((await createSheetConnectionAction("Sheet", value)).ok).toBe(false);
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "");
    expect((await createSheetConnectionAction("Sheet", url)).ok).toBe(false);
    expect((await setConnectorPausedAction(sourceId, "yes" as unknown as boolean)).ok).toBe(false);
    expect((await disconnectConnectorAction("not-a-uuid")).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("validates mapping headers and customer ownership before saving", async () => {
    const mapping = { kind: "invoice", externalId: "ID", number: "Number", amount: "Amount", dueDate: "Due", customerId };
    expect((await saveConnectorMappingAction(sourceId, { ...mapping, number: "Removed" })).ok).toBe(false);
    mocks.customers = [];
    expect((await saveConnectorMappingAction(sourceId, mapping)).ok).toBe(false);
    mocks.customers = [{ id: customerId, business_id: "10000000-0000-4000-8000-000000000002" }];
    expect((await saveConnectorMappingAction(sourceId, mapping)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("save_connector_mapping", { p_source_id: sourceId, p_mapping: mapping });
  });
});
