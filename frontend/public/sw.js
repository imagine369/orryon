/* Minimal Orryon service worker — enables PWA install on Android/Chrome.
   next-pwa does not emit a worker under Next.js 16 + Turbopack; this file is served from /public. */

const CACHE = "orryon-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/manifest.json", "/icon-192.png", "/icon-512.png"]).catch(() => {}),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || Response.error()),
    ),
  );
});
