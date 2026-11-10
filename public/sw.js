// Service worker: makes the app open without a connection and keeps the recipes
// and grocery list you have already viewed readable offline. Changes still need a connection.
const SHELL = "shell-v1";
const API = "api"; // deleted by the app on sign-out

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Try the network and remember the answer; without a connection, use the remembered one. */
async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw error;
  }
}

/** Built files have a fingerprint in their name, so a cached copy never goes stale. */
async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // The connector's approval page must always come from the server.
    if (url.pathname === "/authorize") return;
    event.respondWith(networkFirst(request, SHELL, "/"));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/api/recipes") || url.pathname === "/api/grocery" || url.pathname === "/api/tags") {
    event.respondWith(networkFirst(request, API));
  }
});
