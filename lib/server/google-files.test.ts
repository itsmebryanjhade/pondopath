import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  actor: { userId: "40000000-0000-4000-8000-000000000001", businessId: "10000000-0000-4000-8000-000000000001", role: "owner" as "owner" | "finance" },
  mime: "application/vnd.google-apps.spreadsheet", adminRpc: vi.fn(), userRpc: vi.fn(), accessToken: vi.fn(), fileInfo: vi.fn(), readFile: vi.fn(), ingest: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireActor: async () => state.actor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.adminRpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.userRpc }) }));
vi.mock("@/lib/server/connector-intake", () => ({ ingestGoogleRead: state.ingest }));
vi.mock("@/lib/server/google", () => ({ accessToken: state.accessToken, fileInfo: state.fileInfo, readFile: state.readFile,
  googleConfig: () => ({ clientId: "client.apps.googleusercontent.com", clientSecret: "secret", pickerKey: "picker-key", projectNumber: "319573594672" }) }));
import { connectGoogleFile, googleMessage, pickerSession, readGoogleSetup, saveGoogleSetup } from "./google-files";
import { sealToken } from "./token-safe";

const sourceId = "20000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const sheetInfo = { id: "sheet1234567", name: "Fictional ledger", mimeType: "application/vnd.google-apps.spreadsheet", size: null, trashed: false };
const read = { headers: ["ID", "Type", "Customer", "Amount", "Due Date"], rows: [["SRC-1", "Invoice", "Cafe", 100, 46346], ["SRC-2", "Bayad", "", 20, 46347]], rowNumbers: [2, 3] };

beforeEach(() => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  state.actor.role = "owner";
  state.mime = "application/vnd.google-apps.spreadsheet";
  state.adminRpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "google_connection_token") return { data: sealToken("1//fictional-refresh"), error: null };
    if (name === "google_file_source") return { data: { businessId: state.actor.businessId, status: "awaiting_first_read", fileId: sheetInfo.id, tab: "Sales", settings: { mimeType: state.mime } }, error: null };
    return { data: null, error: null };
  });
  state.userRpc.mockReset().mockImplementation(async (name: string) => name === "create_google_file_connection" ? { data: sourceId, error: null } : { data: null, error: null });
  state.accessToken.mockReset().mockResolvedValue("short-lived-access");
  state.fileInfo.mockReset().mockResolvedValue(sheetInfo);
  state.readFile.mockReset().mockResolvedValue({ tabs: ["Sales", "Bills"], tab: "Sales", read });
  state.ingest.mockReset().mockResolvedValue({ result: "first_read" });
});
afterEach(() => vi.unstubAllEnvs());

describe("Picker session", () => {
  it("is owner-only and returns a short-lived token, never the sealed one", async () => {
    const session = await pickerSession();
    expect(session).toEqual({ token: "short-lived-access", pickerKey: "picker-key", projectNumber: "319573594672", clientId: "client.apps.googleusercontent.com" });
    expect(JSON.stringify(session)).not.toContain("v1.");
    state.actor.role = "finance";
    await expect(pickerSession()).rejects.toThrow("FORBIDDEN");
  });
  it("marks the connection for reconnecting when Google refuses the stored sign-in", async () => {
    state.accessToken.mockRejectedValueOnce(new Error("GOOGLE_RECONNECT"));
    await expect(pickerSession()).rejects.toThrow("GOOGLE_RECONNECT");
    expect(state.adminRpc).toHaveBeenCalledWith("google_connection_status", { p_business: state.actor.businessId, p_status: "needs_reconnect" });
  });
});

describe("connecting a picked file", () => {
  it("uses Google's own metadata, not anything the browser sent, and returns the tabs", async () => {
    expect(await connectGoogleFile(sheetInfo.id)).toEqual({ sourceId, tabs: ["Sales", "Bills"], tab: "Sales" });
    expect(state.userRpc).toHaveBeenCalledWith("create_google_file_connection", { p_label: "Fictional ledger",
      p_settings: { fileId: sheetInfo.id, name: "Fictional ledger", mimeType: sheetInfo.mimeType, tab: "Sales" } });
  });
  it("refuses a Doc, an oversize, trashed or unknown file and creates nothing", async () => {
    for (const code of ["FILE_NOT_SUPPORTED", "FILE_TOO_LARGE", "FILE_ACCESS_LOST"]) {
      state.fileInfo.mockRejectedValueOnce(new Error(code));
      await expect(connectGoogleFile("doc123456789")).rejects.toThrow(code);
    }
    expect(state.userRpc).not.toHaveBeenCalledWith("create_google_file_connection", expect.anything());
  });
  it("is owner-only", async () => {
    state.actor.role = "finance";
    await expect(connectGoogleFile(sheetInfo.id)).rejects.toThrow("FORBIDDEN");
    expect(state.fileInfo).not.toHaveBeenCalled();
  });
});

describe("setup", () => {
  it("first read returns suggestions and labels for the chosen tab and records the first read", async () => {
    const setup = await readGoogleSetup(sourceId, "Bills");
    expect(state.userRpc).toHaveBeenCalledWith("set_google_file_tab", { p_source_id: sourceId, p_tab: "Bills" });
    expect(state.readFile).toHaveBeenCalledWith("short-lived-access", sheetInfo, "Bills");
    expect(setup.fields).toMatchObject({ externalId: "ID", typeColumn: "Type", customer: "Customer", amount: "Amount", dueDate: "Due Date" });
    expect(setup.labels.map(label => label.label)).toEqual(["invoice", "payment"]);
    expect(setup.rows[0][4]).toBe("2026-11-20");
    expect(state.ingest.mock.calls[0][0]).toBe(sourceId);
    expect(state.ingest.mock.calls[0][1]).toMatchObject({ headers: read.headers, rowNumbers: [2, 3] });
  });
  it("a CSV file has no tabs, so its setup works without one", async () => {
    state.mime = "text/csv";
    state.readFile.mockResolvedValue({ tabs: [], tab: null, read });
    const setup = await readGoogleSetup(sourceId, "");
    expect(setup.labels.length).toBe(2);
    expect(state.userRpc).not.toHaveBeenCalledWith("set_google_file_tab", expect.anything());
    expect(state.readFile).toHaveBeenCalledWith("short-lived-access", sheetInfo, undefined);
  });
  it("a workbook still needs a tab", async () => {
    await expect(readGoogleSetup(sourceId, "")).rejects.toThrow("VALIDATION_ERROR");
  });
  it("refuses a source from another business", async () => {
    state.adminRpc.mockImplementation(async (name: string) => name === "google_file_source"
      ? { data: { businessId: "10000000-0000-4000-8000-000000000999", status: "awaiting_first_read", fileId: sheetInfo.id, tab: "Sales" }, error: null }
      : { data: sealToken("r"), error: null });
    await expect(readGoogleSetup(sourceId, "Sales")).rejects.toThrow("NOT_FOUND");
  });
  it("saves only a valid auto mapping", async () => {
    const mapping = { kind: "auto", externalId: "ID", amount: "Amount", dueDate: "Due Date", number: "ID", customerId, label: "Type", payee: "Customer",
      columns: ["ID", "Type", "Customer", "Amount", "Due Date"], excludedIds: [], overrides: {} };
    await saveGoogleSetup(sourceId, mapping);
    expect(state.userRpc).toHaveBeenCalledWith("save_connector_mapping", { p_source_id: sourceId, p_mapping: mapping });
    await expect(saveGoogleSetup(sourceId, { ...mapping, kind: "invoice" })).rejects.toThrow("VALIDATION_ERROR");
    await expect(saveGoogleSetup(sourceId, { ...mapping, columns: ["ID"] })).rejects.toThrow("VALIDATION_ERROR");
  });
});

describe("owner messages", () => {
  it("explains every Google error without technical codes", () => {
    for (const code of ["GOOGLE_RECONNECT", "FILE_ACCESS_LOST", "FILE_TOO_LARGE", "FILE_NOT_SUPPORTED", "FILE_UNREADABLE", "GOOGLE_UNAVAILABLE", "GOOGLE_NOT_CONFIGURED", "DUPLICATE_REFERENCE"])
      expect(googleMessage(code)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    expect(googleMessage("FILE_ACCESS_LOST")).toBe("PondoPath can't open this file anymore. Check that it still exists in your Drive.");
  });
});
