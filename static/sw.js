/* orryon service worker — v2
   Handles caching for static assets so the installed PWA loads fast.
*/

const CACHE_NAME = "orryon-v2";

const PRECACHE_URLS = [
  "/app/static/manifest.json",
  "/app/static/icon-192.png",
  "/app/static/icon-512.png",
];

/* Install: pre-cache static shell assets */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {})
    )
  );
  self.skipWaiting();
});

/* Activate: remove stale caches from previous versions */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* Fetch: cache-first for static assets, network-first for everything else */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests from the same origin
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Static assets (icons, manifest) — cache-first
  if (
    url.pathname.startsWith("/app/static/") &&
    (url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".json") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css"))
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) =>
                cache.put(event.request, clone)
              );
            }
            return response;
          })
      )
    );
    return;
  }

  // All other requests — network-first, no offline fallback
  // Network-first for API and dynamic routes
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
