// PE.AI service worker. Deliberately small:
//  - hashed Next.js assets: cache-first (immutable by URL)
//  - page navigations: network-first, falling back to the last cached copy
//    so the app shell opens on flaky gym Wi-Fi (generation still needs network)
//  - API calls: never cached
const VERSION = "v2";
// Only public pages are kept for offline opens. Signed-in pages (rosters,
// student emails, workouts) are never cached: a shared Chromebook must not show
// the last person's data.
const PUBLIC_PAGES = new Set(["/", "/login", "/privacy", "/terms"]);
const STATIC = `peai-static-${VERSION}`;
const PAGES = `peai-pages-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (request.mode === "navigate" && PUBLIC_PAGES.has(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(async (res) => {
          if (res.ok) {
            const cache = await caches.open(PAGES);
            cache.put(request, res.clone());
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error())
    );
  }
});
