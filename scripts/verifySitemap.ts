/**
 * Verify SEO hardening: public sitemap + robots rules stay sane, and every
 * authenticated-only route is excluded from the sitemap and carries a
 * robots noindex meta — while every PUBLIC content page stays indexable
 * (no noindex / nosnippet / X-Robots-Tag). Pure static check — no DB, no network.
 *
 * Asserts:
 *   1. public/sitemap.xml <loc> set EXACTLY equals the expected public routes
 *      (platform + the 7 module sales pages + MeetingSnap pricing + HomeSnap demo).
 *   2. No authenticated-only route appears in the sitemap
 *      (/profile + the 7 module app routes).
 *   3. public/robots.txt keeps the main crawl allowed, disallows /profile,
 *      /share/ and /api/, and — critically — does NOT block any public page
 *      (robots Disallow is prefix-matched, so /receipts would wrongly block
 *      /receiptsnap-sales; the module pages are handled by noindex meta
 *      instead of robots.txt for that reason).
 *   4. Each authenticated-only route file still carries a robots noindex meta
 *      (`noindex, nofollow`) in its head so crawlers drop it on fetch.
 *   5. No PUBLIC content page carries noindex / nosnippet / X-Robots-Tag —
 *      public module/marketing pages must stay indexable.
 *
 * Run:  bun scripts/verifySitemap.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const BASE = "https://docsnapapp.com";
/** Public routes that SHOULD appear in the sitemap (path → sitemap URL). */
const EXPECTED_PUBLIC: string[] = [
  "/",
  "/about",
  "/billsnap-sales",
  "/booksnap-sales",
  "/changelog",
  "/contact",
  "/contractsnap-sales",
  "/faq",
  "/garagesnap-sales",
  "/homesnap-demo",
  "/homesnap-sales",
  "/meetingsnap-pricing",
  "/meetingsnap-sales",
  "/pricing",
  "/privacy",
  "/receiptsnap-sales",
  "/roadmap",
  "/scan",
  "/status",
  "/terms",
];
/** Authenticated-only routes that must NEVER be in the sitemap (and must be noindex). */
const AUTH_ONLY: string[] = [
  "/profile",
  "/receipts",
  "/garage",
  "/meetingsnap",
  "/homesnap",
  "/contracts",
  "/bills",
  "/books",
];
/** robots.txt Disallow lines that MUST be present. */
const REQUIRED_DISALLOWS = ["/profile", "/share/", "/api/"];
/** Route files (one per auth-only page) that must carry the noindex meta. */
const AUTH_ROUTE_FILES = [
  "src/routes/profile.tsx",
  "src/routes/receipts.tsx",
  "src/routes/garage.tsx",
  "src/routes/meetingsnap.tsx",
  "src/routes/homesnap.tsx",
  "src/routes/contracts.tsx",
  "src/routes/bills.tsx",
  "src/routes/books.tsx",
];
const NOINDEX_RE = /noindex|nosnippet|X-Robots-Tag/i;
/** Map an expected public route to its route file (all are single-segment). */
function publicRouteFile(route: string): string {
  return route === "/" ? "src/routes/index.tsx" : `src/routes/${route}.tsx`;
}
function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
function sitemapPaths(): string[] {
  const xml = read("public/sitemap.xml");
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]!);
  if (locs.length === 0) fail("no <loc> entries found in public/sitemap.xml");
  return locs.map((loc) => {
    const url = new URL(loc);
    if (url.origin !== BASE) {
      fail(`sitemap <loc> ${loc} does not use expected base ${BASE}`);
    }
    return url.pathname === "" ? "/" : url.pathname;
  });
}
function robotsDisallows(): string[] {
  const txt = read("public/robots.txt");
  return Array.from(txt.matchAll(/^Disallow:\s*(\S+)\s*$/gm), (m) => m[1]!);
}
function main() {
  // 1) Sitemap contains EXACTLY the expected public routes.
  const paths = sitemapPaths();
  const expectedSorted = [...EXPECTED_PUBLIC].sort();
  const actualSorted = [...paths].sort();
  if (JSON.stringify(expectedSorted) !== JSON.stringify(actualSorted)) {
    const missing = expectedSorted.filter((p) => !actualSorted.includes(p));
    const extra = actualSorted.filter((p) => !expectedSorted.includes(p));
    fail(
      `sitemap public-route set mismatch. missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
    );
  }
  console.log(`OK  sitemap has exactly the ${actualSorted.length} expected public routes`);
  // 2) No authenticated-only route in the sitemap.
  for (const auth of AUTH_ONLY) {
    if (paths.includes(auth)) fail(`authenticated-only route ${auth} is present in the sitemap`);
  }
  console.log("OK  no authenticated-only route (/profile + 7 module app routes) in the sitemap");
  // 3) robots.txt: main crawl allowed, required disallows present, and no
  //    public page accidentally blocked (robots matching is prefix-based).
  const disallows = robotsDisallows();
  const robots = read("public/robots.txt");
  if (!/^Allow:\s*\/\s*$/m.test(robots)) fail("robots.txt must keep the main crawl allowed (Allow: /)");
  for (const d of REQUIRED_DISALLOWS) {
    if (!disallows.includes(d)) fail(`robots.txt missing required Disallow: ${d}`);
  }
  for (const d of disallows) {
    if (d === "/") continue;
    for (const pub of EXPECTED_PUBLIC) {
      if (pub.startsWith(d)) {
        fail(`robots.txt Disallow: ${d} is a prefix of public route ${pub} — it would block a page in the sitemap`);
      }
    }
  }
  console.log(
    `OK  robots.txt allows /, disallows ${REQUIRED_DISALLOWS.join(", ")}, and blocks no public page`,
  );
  // 4) Each authenticated route still carries the robots noindex meta.
  for (const file of AUTH_ROUTE_FILES) {
    const src = read(file);
    if (!src.includes('"noindex, nofollow"')) {
      fail(`${file} is authenticated-only but no longer carries the robots noindex meta`);
    }
  }
  console.log("OK  all 8 authenticated-only route heads carry robots noindex meta");
  // 5) No PUBLIC content page carries noindex / nosnippet / X-Robots-Tag.
  for (const pub of EXPECTED_PUBLIC) {
    const file = publicRouteFile(pub);
    let src: string;
    try {
      src = read(file);
    } catch {
      fail(`public route ${pub} has no route file at ${file}`);
    }
    if (NOINDEX_RE.test(src)) {
      fail(`${file} is a public content page but carries noindex/nosnippet/X-Robots-Tag — it must stay indexable`);
    }
  }
  console.log(
    `OK  none of the ${EXPECTED_PUBLIC.length} public content pages carries noindex/nosnippet/X-Robots-Tag`,
  );
  console.log("\nPASS: sitemap contains only public routes; robots.txt sane; auth pages excluded + noindex; public pages stay indexable.");
}
main();