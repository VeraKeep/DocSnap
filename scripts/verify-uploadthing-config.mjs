#!/usr/bin/env node
/**
 * Static guard for the DocSnap UploadThing configuration rules.
 *
 * Confirms that src/routes/api/-uploadthing.ts (the UploadThing route handler)
 * follows the two app-wide conventions:
 *   1. UPLOADTHING_SECRET is the CANONICAL single credential path (read first,
 *      matching cloudStorage.ts / assetStorage.ts). UPLOADTHING_TOKEN may only
 *      appear as a backward-compatible fallback (?? after UPLOADTHING_SECRET).
 *   2. isDev is tied to the environment (import.meta.env.DEV) — never the
 *      hard-coded literal `true`, so dev-mode upload behavior never runs in
 *      production.
 *
 * This is a lightweight static check (it greps the source text, it does not
 * execute the handler — a real upload needs a live Clerk session + UploadThing
 * storage, which is not feasible in-sandbox).
 * Run: node scripts/verify-uploadthing-config.mjs
 */
import { readFileSync } from "node:fs";
const file = new URL("../src/routes/api/-uploadthing.ts", import.meta.url);
const src = readFileSync(file, "utf8");
const failures = [];

// 1. Canonical credential: reads UPLOADTHING_SECRET first.
if (!/process\.env\.UPLOADTHING_SECRET/.test(src))
  failures.push("route handler no longer reads process.env.UPLOADTHING_SECRET");

// 2. UPLOADTHING_TOKEN, if present, may only be a fallback AFTER UPLOADTHING_SECRET
//    (same ??? position), never preferred ahead of it.
const secretFirst = /process\.env\.UPLOADTHING_SECRET \?\?\s*process\.env\.UPLOADTHING_TOKEN/.test(src);
if (src.includes("UPLOADTHING_TOKEN") && !secretFirst)
  failures.push(
    "UPLOADTHING_TOKEN appears outside a UPLOADTHING_SECRET-first fallback — UPLOADTHING_SECRET must be the canonical preferred var"
  );

// 3. isDev is tied to the environment, not hard-coded true, and must NOT
//    reference import.meta.env directly. That global is Vite-only: this route
//    is imported by vercel-entry.ts, which build-vercel.sh bundles with bun
//    build, so in the production render function import.meta.env is undefined
//    and the module throws at cold start (the 2026-09-03 FUNCTION_INVOCATION
//    _FAILED outage). Use the safe accessor
//    (import.meta.env?.DEV === true || NODE_ENV === "development").
if (src.includes("isDev: true") || /isDev:\s*true/.test(src))
  failures.push("isDev is hard-coded true — must follow the environment");
if (/isDev:\s*import\.meta\.env\.DEV(?![?.])/.test(src))
  failures.push(
    "isDev references import.meta.env directly — crashes the bun-bundled Vercel render function at cold start (2026-09-03 outage). Use import.meta.env?.DEV === true || NODE_ENV === \"development\"."
  );
if (!/isDev:\s*import\.meta\.env\?\.DEV\s*===\s*true\s*\|\|\s*process\.env\.NODE_ENV\s*===\s*["']development["']/.test(src))
  failures.push("isDev is not the safe accessor (import.meta.env?.DEV === true || NODE_ENV === \"development\")");

if (failures.length) {
  console.error("UPLOADTHING CONFIG CHECK FAILED:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(
  "UploadThing config OK: route handler reads UPLOADTHING_SECRET first (TOKEN only a fallback) and isDev uses the safe accessor (import.meta.env?.DEV === true || NODE_ENV===\"development\")."
);
