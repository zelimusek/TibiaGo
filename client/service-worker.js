const CACHE_NAME = "tibiago-static-v24";
const CLIENT_BUILD = "20260731.4";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/png/pwa-icon-192.png",
  "/png/pwa-icon-512.png"
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

      // An installed PWA may keep an already-open document and its old module
      // graph alive after deployment. Navigate every open game window once to
      // a versioned URL so HTML, CSS and all source scripts come from the same
      // build. Preserve existing parameters such as ?assets=760.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      await Promise.all(windows.map((client) => {
        const target = new URL(client.url);
        target.searchParams.set("build", CLIENT_BUILD);
        // A window may close between matchAll() and navigate(). Do not let one
        // disappearing client abort activation for every other installed PWA.
        return client.navigate(target.href).catch(() => null);
      }));
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
