// Dishio service worker.
// Keeps a copy of the app's own files so it opens fast and can be installed.
// Recipes always come fresh from the server (they need the internet anyway).
//
// Files are fetched "network first", so changes show up on the next visit.
// Raising the number in CACHE_NAME clears old saved copies.

const CACHE_NAME = "dishio-v16";

const APP_FILES = [
  "/",
  "/css/style.css",
  "/js/app.js",
  "/js/api.js",
  "/js/favorites.js",
  "/js/fridge.js",
  "/js/pantry.js",
  "/js/icons.js",
  "/js/layout.js",
  "/js/speech.js",
  "/js/storage.js",
  "/js/texts.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // e.g. POST /api/recipes: straight to the server
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts etc.: browser handles them

  // API: try the network first; for /api/options keep a copy for offline use.
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/options") {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  // Page and app files: network first so updates show up, cache when offline.
  event.respondWith(networkFirst(request, request.mode === "navigate" ? "/" : null));
});

async function networkFirst(request, fallbackPath = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match(request)) || (fallbackPath && (await cache.match(fallbackPath)));
    if (cached) return cached;
    throw err;
  }
}
