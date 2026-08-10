const CACHE_NAME = "tibiago-static-v37";
const CLIENT_BUILD = "20260811.2";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/png/pwa-icon-192.png",
  "/png/pwa-icon-512.png",
  "/png/pwa-icon-maskable-192.png",
  "/png/pwa-icon-maskable-512.png",
  "/png/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));

      // Take control without navigating the page here. The HTML bootstrap owns
      // the single reload and waits for it before asset loading can start.
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Game connections and login data must always go to the server.
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  // The game is online-only, so its code and data must always be current.
  // Tibia.spr is large and the client already persists it in IndexedDB; teeing
  // that stream into Cache Storage can stall an installed desktop PWA before
  // SpriteBuffer receives the complete response.
  if (
    request.mode === "navigate" ||
    requestUrl.pathname.startsWith("/data/") ||
    requestUrl.pathname.startsWith("/party-music/") ||
    /\.(?:js|css|html|webmanifest)$/i.test(requestUrl.pathname)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
