import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./ai", () => ({ requestAssistant: mocks.request }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
import { POST } from "../../app/api/assistant/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(body: BodyInit, headers: Record<string, string> = {}) {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body });
}
describe("assistant HTTP boundary", () => {
  it("rejects missing/foreign origins and non-JSON bodies before inference", async () => {
    for (const headers of [{ origin: "" }, { origin: "https://other.example" }, { "content-type": "text/plain" }] as Record<string, string>[]) {
      expect((await POST(request("{}", headers))).status).toBeGreaterThanOrEqual(400);
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("returns a validation error for broken JSON and counts actual bytes, not Content-Length", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('"' + "あ".repeat(6000) + '"')); controller.close(); } });
    const req = new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "content-length": "2" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves recoverable failures and hides upstream details", async () => {
    const body = JSON.stringify({ task: "explain", question: "Bakit?", expectedRevision: 1 });
    mocks.request.mockRejectedValueOnce(new Error("STALE_VERSION"));
    expect((await POST(request(body))).status).toBe(409);
    mocks.request.mockRejectedValueOnce(new Error("private credential and upstream details"));
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential");
  });
});
