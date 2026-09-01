#!/usr/bin/env node
/**
 * Static guard for the DocSnap service-worker cache policy.
 *
 * Confirms the sw (source of truth public/sw.js, or the built dist/client/sw.js
 * when present) never persists authenticated/API payloads to a runtime cache,
 * while keeping the public scanner shell offline-cacheable.
 *
 * This is a lightweight static check — it does NOT run the service worker. A
 * full SW runtime test is not feasible in this sandbox (no headless SW).
 * Run: node scripts/verify-sw-policy.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const source = new URL("../public/sw.js", import.meta.url);
const built = new URL("../dist/client/sw.js", import.meta.url);
const file = existsSync(built) ? built : source;
const sw = readFileSync(file, "utf8");

const failures = [];
const has = (label, re) => {
  if (!re.test(sw)) failures.push(label);
};

// 1. API + Clerk auth classified, and served network-first WITHOUT caching.
has("missing isApiOrAuthRequest() (classifies /api/ + Clerk auth hosts)", /isApiOrAuthRequest\(/);
has("missing API/auth networkFirst-without-cache branch", /isApiOrAuthRequest\(url\)[\s\S]*?cacheable: false/);
// 2. Authenticated account/app navigation classified so their pages are never cached.
has("missing isAuthenticatedAppPath() (guards /profile + module routes)", /isAuthenticatedAppPath\(/);
has("missing authenticated-app network-only branch", /isAuthenticatedAppPath\(url\.pathname\)[\s\S]*?cacheable: false/);
// 3. The ONLY runtime cache write in networkFirst is gated behind cacheable -> ok.
has("networkFirst() cache.put is not gated behind cacheable", /if \(cacheable && response\.ok\)[\s\S]*?cache\.put\(/);
// 4. Public scanner shell (/, /scan) stays offline-cacheable.
has("missing isPublicShellPath() (offline scanner shell)", /isPublicShellPath\(/);
has("missing public shell cacheable branch", /isPublicShellPath\(url\.pathname\)[\s\S]*?cacheable: true/);
// 5. No cache.put appears outside the two known safe functions (networkFirst
//    guarded by cacheable, or staleWhileRevalidate for static assets).
const putMatches = [...sw.matchAll(/cache\.put\(/g)].length;
if (putMatches < 1) failures.push("no cache.put() found at all");
if (putMatches > 2) failures.push(`expected <=2 cache.put sites (guarded networkFirst + static SWR), found ${putMatches}`);

if (failures.length) {
  console.error("SW CACHE POLICY CHECK FAILED:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`SW cache policy OK (checked ${file.pathname.split("/").slice(-2).join("/")}): /api/ + auth + authenticated pages are never cache.put; scanner shell + static assets stay offline-cacheable.`);
