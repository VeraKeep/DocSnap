/* DocSnap offline app shell service worker. Bump this when the shell changes. */
const CACHE_VERSION = "docsnap-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const SHELL_ROUTES = ["/", "/scan", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Cache routes first so the scanner remains available without a network.
    await cache.addAll(SHELL_ROUTES);
    // TanStack/Vite emits hashed assets. Discover them from the rendered shell.
    for (const route of ["/", "/scan"]) {
      try {
        const response = await fetch(route);
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)=\"([^\"]+\.(?:js|css|woff2?|png|svg|webp|jpg|jpeg))[^\"]*\"/gi)]
          .map((match) => match[1])
          .filter((url) => url.startsWith("/"));
        await cache.addAll([...new Set(assets)]);
      } catch {
        // A failed optional asset must not prevent the scanner shell installing.
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("docsnap-") && !keep.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isStaticAsset(request) {
  return ["script", "style", "font", "image"].includes(request.destination);
}

function isNetworkFirst(request) {
  const url = new URL(request.url);
  // API calls, Clerk auth, and content-hashed build assets must always prefer
  // the network so a cached stale copy can never mask a fresh deployment.
  return url.pathname.startsWith("/api/") || url.hostname.includes("clerk") || url.pathname.startsWith("/assets/");
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    // Fall back to any cached copy (runtime or install-time shell cache) so
    // the scanner keeps working offline.
    return (await caches.match(request)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) (await caches.open(RUNTIME_CACHE)).put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirst(request)) {
    event.respondWith(networkFirst(request));
  } else if (isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
  } else if (request.mode === "navigate") {
    // Network-first keeps server-rendered routes fresh; cached shell enables offline scanning.
    event.respondWith(networkFirst(request).then((response) => response.status === 0 ? caches.match("/scan") : response));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
