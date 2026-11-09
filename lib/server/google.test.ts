import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken, exchangeCode, fileInfo, readFile, revoke, setGoogleFetch, type FileInfo } from "./google";

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
let routes: [RegExp, Route][] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const idToken = (payload: object) => ["x", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
const sheet: FileInfo = { id: "sheet123456", name: "Fictional", mimeType: "application/vnd.google-apps.spreadsheet", size: null, trashed: false };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const grid = [["ID", "Amount", "Due"], ["SRC-1", 100, "2026-11-20"], [], ["SRC-2", 250.5, "2026-11-21"]];
const csvText = "ID,Amount,Due\nSRC-1,100,2026-11-20\nSRC-2,250.5,2026-11-21\n";
const quotedTab = (name: string) => new RegExp("values/" + encodeURIComponent(`'${name}'`).replace(/[()']/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase()) + "|values/'" + name + "'|values/%27" + name + "%27");

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "fictional-secret");
  routes = [];
  setGoogleFetch(async (input, init) => {
    const url = new URL(String(input));
    const route = routes.find(([pattern]) => pattern.test(url.href));
    if (!route) throw new Error("unexpected " + url.href);
    return route[1](url, init);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("sign-in tokens", () => {
  it("exchanges a code and returns the refresh token, scopes and email", async () => {
    routes.push([/oauth2\.googleapis\.com\/token/, (_, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("code_verifier")).toBe("verifier");
      expect(body.get("client_secret")).toBe("fictional-secret");
      return json({ access_token: "a", refresh_token: "r", scope: "openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email", id_token: idToken({ email: "owner@fictional.example" }) });
    }]);
    await expect(exchangeCode("code", "verifier", "http://localhost:3000/api/google/callback")).resolves.toEqual({
      refreshToken: "r", scopes: ["openid", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"], email: "owner@fictional.example" });
  });
  it("rejects a missing drive.file scope or a missing refresh token", async () => {
    routes.push([/token/, () => json({ access_token: "a", refresh_token: "r", scope: "openid", id_token: idToken({ email: "o@x.example" }) })]);
    await expect(exchangeCode("c", "v", "u")).rejects.toThrow("GOOGLE_RECONNECT");
    routes = [[/token/, () => json({ access_token: "a", scope: "https://www.googleapis.com/auth/drive.file", id_token: idToken({ email: "o@x.example" }) })]];
    await expect(exchangeCode("c", "v", "u")).rejects.toThrow("GOOGLE_RECONNECT");
  });
  it("maps invalid_grant to GOOGLE_RECONNECT and outages to GOOGLE_UNAVAILABLE", async () => {
    routes.push([/token/, () => json({ error: "invalid_grant" }, 400)]);
    await expect(accessToken("r")).rejects.toThrow("GOOGLE_RECONNECT");
    routes = [[/token/, () => json({}, 503)]];
    await expect(accessToken("r")).rejects.toThrow("GOOGLE_UNAVAILABLE");
    setGoogleFetch(async () => { throw new TypeError("network down"); });
    await expect(accessToken("r")).rejects.toThrow("GOOGLE_UNAVAILABLE");
  });
  it("revoke never throws", async () => {
    setGoogleFetch(async () => { throw new TypeError("network down"); });
    await expect(revoke("r")).resolves.toBeUndefined();
  });
});

describe("file metadata", () => {
  it("returns allowed files and maps missing, trashed, unsupported and oversize files", async () => {
    routes.push([/files\/ok123456789/, () => json({ id: "ok123456789", name: "Ledger", mimeType: "text/csv", size: "120", trashed: false })]);
    routes.push([/files\/gone12345678/, () => json({ error: { code: 404 } }, 404)]);
    routes.push([/files\/trash1234567/, () => json({ id: "trash1234567", name: "T", mimeType: "text/csv", size: "1", trashed: true })]);
    routes.push([/files\/doc123456789/, () => json({ id: "doc123456789", name: "D", mimeType: "application/vnd.google-apps.document", trashed: false })]);
    routes.push([/files\/big123456789/, () => json({ id: "big123456789", name: "B", mimeType: XLSX, size: String(600 * 1024), trashed: false })]);
    await expect(fileInfo("t", "ok123456789")).resolves.toEqual({ id: "ok123456789", name: "Ledger", mimeType: "text/csv", size: 120, trashed: false });
    await expect(fileInfo("t", "gone12345678")).rejects.toThrow("FILE_ACCESS_LOST");
    await expect(fileInfo("t", "trash1234567")).rejects.toThrow("FILE_ACCESS_LOST");
    await expect(fileInfo("t", "doc123456789")).rejects.toThrow("FILE_NOT_SUPPORTED");
    await expect(fileInfo("t", "big123456789")).rejects.toThrow("FILE_TOO_LARGE");
    await expect(fileInfo("t", "../etc")).rejects.toThrow("FILE_ACCESS_LOST");
  });
});

describe("reading files", () => {
  const expected = { headers: ["ID", "Amount", "Due"], rowNumbers: [2, 4] };
  it("reads a Sheet through values.get, skipping blank rows and keeping row numbers", async () => {
    routes.push([/spreadsheets\/sheet123456\?fields/, () => json({ sheets: [{ properties: { title: "Sales" } }, { properties: { title: "Bills" } }] })]);
    routes.push([quotedTab("Bills"), url => { expect(url.searchParams.get("valueRenderOption")).toBe("UNFORMATTED_VALUE"); return json({ values: grid }); }]);
    const result = await readFile("t", sheet, "Bills");
    expect(result.tabs).toEqual(["Sales", "Bills"]);
    expect(result.tab).toBe("Bills");
    expect(result.read).toEqual({ ...expected, rows: [["SRC-1", 100, "2026-11-20"], ["SRC-2", 250.5, "2026-11-21"]] });
  });
  it("an empty tab is unreadable and a renamed or removed tab is reported, never swapped", async () => {
    routes.push([/spreadsheets\/sheet123456\?fields/, () => json({ sheets: [{ properties: { title: "Sales" } }] })]);
    routes.push([quotedTab("Sales"), () => json({})]);
    await expect(readFile("t", sheet, "Sales")).rejects.toThrow("FILE_UNREADABLE");
    await expect(readFile("t", sheet, "Bills")).rejects.toThrow("TAB_MISSING");
  });
  it("uses the first tab by default", async () => {
    routes.push([/spreadsheets\/sheet123456\?fields/, () => json({ sheets: [{ properties: { title: "Sales" } }] })]);
    routes.push([quotedTab("Sales"), () => json({ values: grid })]);
    expect((await readFile("t", sheet)).tab).toBe("Sales");
  });
  it("falls back to an xlsx export when the Sheets API refuses drive.file", async () => {
    const workbook = readFileSync("public/samples/pondopath-invoices.xlsx");
    routes.push([/sheets\.googleapis\.com/, () => json({ error: { status: "PERMISSION_DENIED" } }, 403)]);
    routes.push([/files\/sheet123456\/export/, url => { expect(url.searchParams.get("mimeType")).toBe(XLSX); return new Response(workbook); }]);
    const result = await readFile("t", sheet);
    expect(result.tabs.length).toBeGreaterThan(0);
    expect(result.tab).toBe(result.tabs[0]);
    expect(result.read.headers.length).toBeGreaterThan(0);
    expect(result.read.rows.length).toBe(result.read.rowNumbers.length);
  });
  it("csv files give the same read shape as Sheets", async () => {
    routes.push([/files\/csv123456789\?alt=media/, () => new Response(csvText)]);
    const result = await readFile("t", { id: "csv123456789", name: "c.csv", mimeType: "text/csv", size: 80, trashed: false });
    expect(result).toEqual({ tabs: [], tab: null, read: { ...expected, rowNumbers: [2, 3], rows: [["SRC-1", "100", "2026-11-20"], ["SRC-2", "250.5", "2026-11-21"]] } });
  });
  it("files over the row limits are FILE_TOO_LARGE, not unreadable", async () => {
    const many = ["ID,Amount,Due", ...Array.from({ length: 101 }, (_, i) => `R${i},1,2026-11-20`), ""].join(String.fromCharCode(10));
    routes.push([/files\/csv123456789\?alt=media/, () => new Response(many)]);
    await expect(readFile("t", { id: "csv123456789", name: "c.csv", mimeType: "text/csv", size: 1, trashed: false })).rejects.toThrow("FILE_TOO_LARGE");
    routes.push([/spreadsheets\/sheet123456\?fields/, () => json({ sheets: [{ properties: { title: "Sales" } }] })]);
    routes.push([quotedTab("Sales"), () => json({ values: [["ID"], ...Array.from({ length: 501 }, (_, i) => ["R" + i])] })]);
    await expect(readFile("t", sheet)).rejects.toThrow("FILE_TOO_LARGE");
  });
  it("an oversize download is refused even when metadata had no size", async () => {
    routes.push([/files\/csv123456789\?alt=media/, () => new Response("x".repeat(600 * 1024))]);
    await expect(readFile("t", { id: "csv123456789", name: "c.csv", mimeType: "text/csv", size: null, trashed: false })).rejects.toThrow("FILE_TOO_LARGE");
  });
  it("a lost file during download is FILE_ACCESS_LOST and unreadable content is FILE_UNREADABLE", async () => {
    routes.push([/files\/csv123456789\?alt=media/, () => json({}, 404)]);
    await expect(readFile("t", { id: "csv123456789", name: "c.csv", mimeType: "text/csv", size: 1, trashed: false })).rejects.toThrow("FILE_ACCESS_LOST");
    routes = [[/files\/xls123456789\?alt=media/, () => new Response("not a zip")]];
    await expect(readFile("t", { id: "xls123456789", name: "x.xlsx", mimeType: XLSX, size: 9, trashed: false })).rejects.toThrow("FILE_UNREADABLE");
  });
});
