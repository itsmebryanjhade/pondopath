import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ ingest: vi.fn() }));
vi.mock("@/lib/server/connector-intake", () => ({ ingestConnectorRead: mocks.ingest }));
import { POST } from "@/app/api/intake/connectors/[sourceId]/route";
const sourceId = "20000000-0000-4000-8000-000000000001";
const key = "fictional-connector-key-with-32-bytes-long";
const context = { params: Promise.resolve({ sourceId }) };
function request(body: unknown, auth: string | null = "Bearer " + key, type = "application/json") {
  return new Request("http://localhost/api/intake/connectors/" + sourceId, { method: "POST", headers: { "Content-Type": type, Cookie: "fictional-session", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
}
const body = { runId: "1", headers: ["ID"], rows: [["private-row-value"]], rowNumbers: [2] };
beforeEach(() => { vi.resetAllMocks(); mocks.ingest.mockResolvedValue({ result: "first_read", staged: 0 }); });
describe("connector bearer-only HTTP boundary", () => {
  it("rejects missing bearer or a session cookie without it", async () => {
    for (const auth of [null, "Basic " + key, "Bearer short"]) expect((await POST(request(body, auth), context)).status).toBe(401);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("maps wrong, replaced or disconnected keys to 401 without exposing data", async () => {
    mocks.ingest.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const response = await POST(request(body), context);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toMatch(/private-row-value|fictional-connector-key/);
  });
  it("rejects non-JSON, malformed shape, caller business scope and actual oversized bytes", async () => {
    expect((await POST(request(body, undefined, "text/plain"), context)).status).toBe(400);
    expect((await POST(request({ ...body, businessId: sourceId }), context)).status).toBe(400);
    expect((await POST(request({ ...body, rows: [["₱".repeat(180_000)]] }), context)).status).toBe(413);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("passes only the parsed source, key and bounded read, with safe no-store errors", async () => {
    const response = await POST(request(body), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.ingest).toHaveBeenCalledWith(sourceId, key, body);
    mocks.ingest.mockRejectedValue(new Error("private-row-value " + key));
    const failed = await POST(request(body), context);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(/private-row-value|fictional-connector-key/);
  });

  it("passes an over-limit Sheet to the authenticated service so it can be recorded as failed", async () => {
    const big = { runId: "big", headers: ["ID"], rows: Array.from({ length: 501 }, (_, i) => ["r" + i]), rowNumbers: Array.from({ length: 501 }, (_, i) => i + 2) };
    expect((await POST(request(big), context)).status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(sourceId, key, big);
  });

  it("reports an internal TypeError as unavailable while malformed JSON is an invalid request", async () => {
    mocks.ingest.mockRejectedValue(new TypeError("private-row-value"));
    expect((await POST(request(body), context)).status).toBe(503);
    const malformed = new Request("http://localhost/api/intake/connectors/" + sourceId, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: "{" });
    expect((await POST(malformed, context)).status).toBe(400);
  });
});
