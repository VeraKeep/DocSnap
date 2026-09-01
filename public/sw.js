/* DocSnap offline app shell service worker. Bump this when the shell changes. */
const CACHE_VERSION = "docsnap-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const SHELL_ROUTES = ["/", "/scan", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

// ---------------------------------------------------------------------------
// CACHE POLICY (privacy — keep this current)
// ---------------------------------------------------------------------------
// This service worker NEVER writes authenticated or user-specific data to any
// persistent cache. DocSnap holds sensitive documents (receipts, bills,
// contracts, cloud files, meetings), so a signed-in user's data must not
// survive in Cache Storage.
//
//   * /api/ + Clerk auth requests  -> network-first, NEVER cached (fetch only).
//   * Authenticated account/app pages (/profile + all module routes) ->
//     network-only, NEVER cached, no offline fallback. A signed-in user's page
//     is never persisted.
//   * Public scanner shell (/, /scan) -> network-first WITH cache, so the
//     scanner keeps working offline.
//   * Static build assets (hashed /assets/*, scripts/styles/fonts/images) ->
//     stale-while-revalidate. These are public + content-hashed, so caching is
//     harmless.
//   * All other navigation (public marketing pages) -> network-first WITHOUT
//     cache. It still serves fresh, it just never persists.
//
// Net: ONLY the public scanner shell and static assets may be stored offline.
// Never add authenticated paths or /api/ payloads to RUNTIME_CACHE/SHELL_CACHE.
// ---------------------------------------------------------------------------

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

// Every API/auth endpoint returns data tied to the signed-in user (documents,
// entitlements, receipts, bills, ...). Never cached — see policy above.
function isApiOrAuthRequest(url) {
  return url.pathname.startsWith("/api/") || url.hostname.includes("clerk");
}

// Authenticated account/app pages. /profile is the account shell and the module
// routes render that user's data. A signed-in user's page must never be cached.
const AUTHENTICATED_APP_PATHS = [
  "/profile",
  "/receipts",
  "/bills",
  "/contracts",
  "/books",
  "/garage",
  "/homesnap",
  "/meetingsnap",
];
function isAuthenticatedAppPath(pathname) {
  return AUTHENTICATED_APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// The only routes we may persist offline: the public scanner/landing shell.
function isPublicShellPath(pathname) {
  return pathname === "/" || pathname === "/scan";
}

// Network-first that writes to the cache ONLY when `cacheable` is true.
async function networkFirst(request, { cacheable }) {
  try {
    const response = await fetch(request);
    if (cacheable && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Fall back ONLY to an already-cached copy (runtime or install-time shell)
    // for cacheable responses. For non-cacheable requests we never cached them,
    // so there is nothing safe to fall back to — report the network failure.
    if (cacheable) {
      return (await caches.match(request)) || Response.error();
    }
    return Response.error();
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

  // 1) API + Clerk auth: fetch from network, NEVER write to any cache.
  if (isApiOrAuthRequest(url)) {
    event.respondWith(networkFirst(request, { cacheable: false }));
    return;
  }

  // 2) Static build assets (hashed /assets/*, scripts/styles/fonts/images):
  //    public + content-hashed, so revalidate caching is safe (harmless).
  if (isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 3) Navigation.
  if (request.mode === "navigate") {
    if (isAuthenticatedAppPath(url.pathname)) {
      // Account/app pages carry user data (or gate on the user's entitlements).
      // Go strictly network-only: never persist, and never silently show a
      // stale shell to a signed-in user. Offline, they correctly error.
      event.respondWith(networkFirst(request, { cacheable: false }));
      return;
    }
    if (isPublicShellPath(url.pathname)) {
      // Public scanner shell: network-first WITH cache keeps scanning offline.
      event.respondWith(
        networkFirst(request, { cacheable: true }).then((response) =>
          response.status === 0 ? caches.match("/scan") : response,
        ),
      );
      return;
    }
    // Any other page (public marketing/landing): network-first WITHOUT cache —
    // stays fresh online, never persists.
    event.respondWith(networkFirst(request, { cacheable: false }));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
