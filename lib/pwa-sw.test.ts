import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function load() {
  const listeners = new Map<string, Listener>();
  const store = new Map<string, Response>();
  const cache = {
    addAll: vi.fn(async (urls: string[]) => { urls.forEach(url => store.set(url, new Response("cached " + url))); }),
    match: vi.fn(async (request: Request | string) => store.get(typeof request === "string" ? request : new URL(request.url).pathname)),
    put: vi.fn(async (request: Request, response: Response) => { store.set(new URL(request.url).pathname, response); }),
  };
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async (url: string) => store.get(url)), keys: vi.fn(async () => []), delete: vi.fn() };
  const fetcher = vi.fn();
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(), clients: { claim: vi.fn() },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches, fetch: fetcher, URL, Promise, Response });
  const request = (path: string, init: { method?: string; mode?: string; origin?: string } = {}) => ({
    method: init.method ?? "GET", mode: init.mode ?? "cors", url: (init.origin ?? "https://app.test") + path,
  });
  function fire(req: ReturnType<typeof request>) {
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: req, respondWith });
    return respondWith;
  }
  return { listeners, store, cache, caches, fetcher, fire, request, self };
}

describe("service worker", () => {
  it("precaches only the offline page and public brand files on install", async () => {
    const sw = load();
    let ready: Promise<unknown> = Promise.resolve();
    sw.listeners.get("install")!({ waitUntil: (promise: Promise<unknown>) => { ready = promise; } });
    await ready;
    const urls = sw.cache.addAll.mock.calls[0][0] as string[];
    expect(urls).toContain("/offline");
    expect(urls.every(url => url === "/offline" || url.startsWith("/pwa/") || url.startsWith("/brand/"))).toBe(true);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("shows the offline page only when a page request fails, and never stores the page", async () => {
    const sw = load();
    sw.store.set("/offline", new Response("offline page"));
    sw.fetcher.mockRejectedValue(new TypeError("offline"));
    const respond = sw.fire(sw.request("/overview", { mode: "navigate" }));
    expect(await (await respond.mock.calls[0][0]).text()).toBe("offline page");
    sw.fetcher.mockResolvedValue(new Response("live page"));
    const live = sw.fire(sw.request("/overview", { mode: "navigate" }));
    expect(await (await live.mock.calls[0][0]).text()).toBe("live page");
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("leaves API calls, server data, writes and other origins to the network", () => {
    const sw = load();
    for (const req of [
      sw.request("/api/assistant"), sw.request("/overview?_rsc=abc"), sw.request("/invoices/1"),
      sw.request("/api/assistant", { method: "POST" }), sw.request("/rest/v1/invoices", { origin: "https://db.supabase.co" }),
    ]) expect(sw.fire(req)).not.toHaveBeenCalled();
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("serves versioned static files and brand images from cache, refreshing in the background", async () => {
    const sw = load();
    sw.store.set("/pwa/icon-192.png", new Response("old icon"));
    sw.fetcher.mockResolvedValue(new Response("new icon"));
    const respond = sw.fire(sw.request("/pwa/icon-192.png"));
    expect(await (await respond.mock.calls[0][0]).text()).toBe("old icon");
    await Promise.resolve();
    expect(sw.fetcher).toHaveBeenCalled();
  });
});
