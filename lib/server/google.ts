import "server-only";
import { CSV_LIMITS, readCsv, type CsvFile } from "@/lib/domain/imports";
import { readXlsx } from "@/lib/domain/xlsx";
import { CONNECTOR_LIMITS, type ConnectorSheetRead } from "@/lib/domain/connector-rows";

/** The only module that calls Google. Errors are thrown as `new Error(code)` and never contain tokens or file content. */
export type GoogleError = "GOOGLE_RECONNECT" | "FILE_ACCESS_LOST" | "TAB_MISSING" | "FILE_TOO_LARGE" | "FILE_NOT_SUPPORTED" | "FILE_UNREADABLE" | "GOOGLE_UNAVAILABLE";
export type FileInfo = { id: string; name: string; mimeType: string; size: number | null; trashed: boolean };
export type GoogleRead = Omit<ConnectorSheetRead, "runId">;

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIMES = ["text/csv", "application/vnd.ms-excel"];
// Drive files and the Sheet export reuse the hardened upload parsers, which accept up to 512 KiB.
const MAX_BYTES = CSV_LIMITS.bytes;

let googleFetch: typeof fetch = (input, init) => fetch(input, init);
/** Test seam: replaces the network call. */
export function setGoogleFetch(next: typeof fetch) { googleFetch = next; }

const fail = (code: GoogleError): never => { throw new Error(code); };

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  try { return await googleFetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { return fail("GOOGLE_UNAVAILABLE"); }
}

/** Maps a Google API response status to our error codes; 401 means the sign-in no longer works. */
function check(response: Response, missing: GoogleError = "FILE_ACCESS_LOST"): Response {
  if (response.ok) return response;
  if (response.status === 401) fail("GOOGLE_RECONNECT");
  if (response.status === 403 || response.status === 404) fail(missing);
  return fail("GOOGLE_UNAVAILABLE");
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "", clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
  const pickerKey = process.env.GOOGLE_PICKER_API_KEY ?? "", projectNumber = process.env.GOOGLE_PROJECT_NUMBER ?? "";
  if (!clientId || !clientSecret) throw new Error("GOOGLE_NOT_CONFIGURED");
  return { clientId, clientSecret, pickerKey, projectNumber };
}

async function tokenRequest(fields: Record<string, string>) {
  const { clientId, clientSecret } = googleConfig();
  const response = await call("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (response.status === 400 || response.status === 401) fail("GOOGLE_RECONNECT");
  if (!response.ok) fail("GOOGLE_UNAVAILABLE");
  return await response.json().catch(() => fail("GOOGLE_UNAVAILABLE")) as Record<string, unknown>;
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<{ refreshToken: string; scopes: string[]; email: string }> {
  const body = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
  const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [];
  if (typeof body.refresh_token !== "string" || !body.refresh_token || !scopes.includes(DRIVE_FILE_SCOPE)) fail("GOOGLE_RECONNECT");
  // The ID token comes straight from Google's token endpoint over TLS, so its payload can be read without a separate signature check.
  let email: unknown;
  try { email = JSON.parse(Buffer.from(String(body.id_token).split(".")[1] ?? "", "base64url").toString("utf8")).email; } catch { email = undefined; }
  if (typeof email !== "string" || !email.includes("@") || email.length > 320) fail("GOOGLE_RECONNECT");
  return { refreshToken: body.refresh_token as string, scopes, email: email as string };
}

export async function accessToken(refreshToken: string): Promise<string> {
  const body = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  return typeof body.access_token === "string" && body.access_token ? body.access_token : fail("GOOGLE_UNAVAILABLE");
}

export async function revoke(refreshToken: string): Promise<void> {
  try {
    await googleFetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(), signal: AbortSignal.timeout(10_000) });
  } catch { /* Best effort: the stored token is deleted either way. */ }
}

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

export async function fileInfo(token: string, fileId: string): Promise<FileInfo> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) fail("FILE_ACCESS_LOST");
  const response = check(await call(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,trashed&supportsAllDrives=true`, auth(token)));
  const body = await response.json().catch(() => fail("GOOGLE_UNAVAILABLE")) as Record<string, unknown>;
  const info: FileInfo = { id: String(body.id ?? ""), name: String(body.name ?? "").slice(0, 200), mimeType: String(body.mimeType ?? ""),
    size: body.size === undefined ? null : Number(body.size), trashed: body.trashed === true };
  if (info.id !== fileId || info.trashed) fail("FILE_ACCESS_LOST");
  if (![SHEET_MIME, XLSX_MIME, ...CSV_MIMES].includes(info.mimeType)) fail("FILE_NOT_SUPPORTED");
  if (info.size !== null && (!Number.isFinite(info.size) || info.size > MAX_BYTES)) fail("FILE_TOO_LARGE");
  return info;
}

async function download(url: string, token: string): Promise<Uint8Array> {
  const response = check(await call(url, auth(token)));
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) fail("FILE_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer().catch(() => fail("GOOGLE_UNAVAILABLE")));
  return bytes.length > MAX_BYTES ? fail("FILE_TOO_LARGE") : bytes;
}

const fromFile = (file: CsvFile): GoogleRead => ({ headers: file.headers, rows: file.rows, rowNumbers: file.rows.map((_, index) => file.rowNumbers?.[index] ?? index + 2) });

async function parse<T>(work: () => Promise<T> | T): Promise<T> {
  // The upload parsers reject more than 100 data rows; that is a size problem, not an unreadable file.
  try { return await work(); } catch (error) { return fail(error instanceof Error && error.message.includes("1–100 data rows") ? "FILE_TOO_LARGE" : "FILE_UNREADABLE"); }
}

async function readWorkbook(bytes: Uint8Array, tab?: string) {
  const { sheets } = await parse(() => readXlsx(bytes));
  // A saved tab that was renamed or removed is reported, never silently swapped for another tab.
  if (tab && !sheets.includes(tab)) fail("TAB_MISSING");
  const chosen = tab ?? sheets[0];
  if (!chosen) fail("FILE_UNREADABLE");
  const { file } = await parse(() => readXlsx(bytes, chosen));
  return { tabs: sheets, tab: chosen, read: fromFile(file ?? fail("FILE_UNREADABLE")) };
}

/** Same shape as the n8n workflow: exact headers, typed cells, blank rows skipped, real Sheet row numbers kept. */
function fromGrid(values: unknown[][]): GoogleRead {
  const headers = (values[0] ?? []).map(value => String(value ?? ""));
  const rows: (string | number | boolean | null)[][] = [], rowNumbers: number[] = [];
  values.slice(1).forEach((row, index) => {
    if (!row.some(value => value !== null && value !== "")) return;
    const width = Math.max(headers.length, row.length);
    rows.push(Array.from({ length: width }, (_, column) => {
      const value = row[column];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
    }));
    rowNumbers.push(index + 2);
  });
  return { headers, rows, rowNumbers };
}

export async function readFile(token: string, info: FileInfo, tab?: string): Promise<{ tabs: string[]; tab: string | null; read: GoogleRead }> {
  const base = `https://www.googleapis.com/drive/v3/files/${info.id}`;
  if (info.mimeType === XLSX_MIME) return readWorkbook(await download(`${base}?alt=media`, token), tab);
  if (info.mimeType !== SHEET_MIME) {
    const bytes = await download(`${base}?alt=media`, token);
    return { tabs: [], tab: null, read: fromFile(await parse(() => readCsv(bytes))) };
  }
  const sheets = `https://sheets.googleapis.com/v4/spreadsheets/${info.id}`;
  const meta = await call(`${sheets}?fields=sheets.properties.title`, auth(token));
  // If drive.file does not cover the Sheets API for this file, read the Sheet as an Excel export instead.
  if (meta.status === 403 || meta.status === 404) return readWorkbook(await download(`${base}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, token), tab);
  const titles = ((await check(meta).json().catch(() => fail("GOOGLE_UNAVAILABLE"))) as { sheets?: { properties?: { title?: string } }[] }).sheets
    ?.map(sheet => sheet.properties?.title).filter((title): title is string => !!title) ?? [];
  if (tab && !titles.includes(tab)) fail("TAB_MISSING");
  const chosen = tab ?? titles[0] ?? fail("FILE_UNREADABLE");
  const range = encodeURIComponent(`'${chosen.replaceAll("'", "''")}'`);
  const values = check(await call(`${sheets}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`, auth(token)));
  const body = await values.json().catch(() => fail("GOOGLE_UNAVAILABLE")) as { values?: unknown[][] };
  const read = fromGrid(Array.isArray(body.values) ? body.values : []);
  if (!read.headers.some(header => header.trim())) fail("FILE_UNREADABLE");
  if (read.rows.length > CONNECTOR_LIMITS.rows) fail("FILE_TOO_LARGE");
  return { tabs: titles, tab: chosen, read };
}
