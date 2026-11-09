// PondoPath service worker. It only keeps public, non-personal assets and an offline page.
// Signed-in pages, API replies and Supabase data are never cached: money data stays on the server.
const VERSION = "pondopath-v1";
const SHELL = VERSION + "-shell";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/pwa/icon-192.png", "/pwa/icon-512.png", "/brand/pondopath-mark.png"];
const CACHEABLE = /^\/(?:_next\/static\/|pwa\/|brand\/)/;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("pondopath-") && key !== SHELL).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the live server; show the offline page only when there is no connection.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Versioned static files and brand images: serve from cache, refresh in the background.
  if (CACHEABLE.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(async cache => {
        const cached = await cache.match(request);
        const refresh = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        if (cached) { refresh.catch(() => {}); return cached; }
        return refresh;
      }),
    );
  }
  // Everything else (API, server components, uploads) goes straight to the network.
});
