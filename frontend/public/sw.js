// Hand-written service worker. Invariant: nothing under /api/ is ever intercepted or cached.
// The build replaces these two literals (see swInject.ts); unreplaced they are still valid JS.
const BUILD_ID = "__BUILD_ID__";
const PRECACHE = ["__PRECACHE__"];
const CACHE = `waxline-shell-${BUILD_ID}`;

// Case-insensitive on purpose: "/API/x" is not the API route, but treating it as one only
// means the network handles it, which is the safe direction.
const isApi = (url) => /^\/api(\/|$)/i.test(url.pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  // Safe to activate at once: the cache holds only the build's own files, and navigations are network-first.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url, self.location.href);
  if (isApi(url) || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/").then((r) => r || Response.error())));
    return;
  }

  // Vite emits content-hashed files under /assets/, so cache-first is safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Hosting may answer a deleted hash with SPA fallback HTML and 200: never cache that.
            const type = res.headers.get("content-type") || "";
            if (res.ok && res.type === "basic" && !type.startsWith("text/html")) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
