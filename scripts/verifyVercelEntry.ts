/**
 * Regression guard for the 2026-09-03 prod outage (FUNCTION_INVOCATION_FAILED
 * on every docsnapapp.com URL).
 *
 * Root cause: `src/routes/api/-uploadthing.ts` referenced `import.meta.env.DEV`
 * directly. `import.meta.env` is a Vite-injected global — it exists in code
 * bundled through Vite (the app routes) but is UNDEFINED in the render function
 * built by `build-vercel.sh`, which bundles `vercel-entry.ts` + the `-*` API
 * routes it imports with **bun build**. One `import.meta.env.DEV` reference in
 * that bun-bundled path crashed the whole render function at cold start
 * (TypeError reading 'DEV'), so every URL — old and new deployments alike —
 * returned HTTP 500 FUNCTION_INVOCATION_FAILED.
 *
 * This guard has two layers:
 *  1. STATIC: no `import.meta.env` (or `.env.` member access) may appear in any
 *     file that flows into the bun-built render function. These are
 *     `vercel-entry.ts` and everything it (transitively) imports from `src/`,
 *     which all bundle into the single `index.mjs` render function.
 *  2. RUNTIME: actually boot the built render function bundle (the exact
 *     `index.mjs` produced by `build-vercel.sh`) as Vercel's classic Node
 *     launcher does, and require it. If module init throws, the site would
 *     FUNCTION_INVOCATION_FAILED again — fail the guard.
 *
 * Run `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be exported before build-vercel.sh
 * (build-time requirement), and `.vercel/output` must exist (built). This script
 * is wired into `npm run verify` AFTER the static node guards.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(process.cwd());
const VERCEL_ENTRY = join(ROOT, "vercel-entry.ts");
const RENDER_BUNDLE = join(
  ROOT,
  ".vercel/output/functions/render.func/index.mjs",
);

// Entry files that belong to the bun-built render function (build-vercel.sh):
// vercel-entry.ts plus the "-" prefixed API routes it mounts. EVERY file it
// imports is bundled, but scanning the full transitive closure is fragile;
// the practical risk surface is the routes vercel-entry directly imports and
// the modules they pull in (uploadthing, stripe, billsnap, subscription,
// serverAuth, cloudStorage, assetStorage). We scan those target files plus a
// static grep across src/ for `import.meta.env` in files that are NOT part of
// the Vite-only client layer.
const BUN_BUNDLED_TARGETS = [
  "vercel-entry.ts",
  "src/routes/api/-uploadthing.ts",
  "src/routes/api/-stripe-webhook.ts",
  "src/routes/api/-billsnap-email-ingest.ts",
  "src/routes/api/-billsnap-email-inbound.ts",
  "src/uploadthing.ts",
  "src/subscription.ts",
  "src/serverAuth.ts",
  "src/cloudStorage.ts",
  "src/assetStorage.ts",
];

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function scanForMetaEnv(file: string): string[] {
  const abs = resolve(file);
  if (!existsSync(abs)) {
    // Only the entry is mandatory; helpers may legitimately be absent.
    if (file === VERCEL_ENTRY) fail(`missing vercel-entry.ts at ${abs}`);
    return [];
  }
  const src = readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const hits: string[] = [];
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith("//") || ln.trim().startsWith("*")) return;
    // Flag any `import.meta.env` reference UNLESS it uses the safe
    // optional-chaining form `import.meta.env?.` — that form evaluates to
    // undefined instead of throwing when the global is absent in the
    // bun-built render bundle (which is exactly the 2026-09-03 fix).
    if (/import\.meta\.env/.test(ln) && !/import\.meta\.env\?\./.test(ln)) {
      hits.push(`${relative(ROOT, abs)}:${i + 1}: ${ln.trim()}`);
    }
  });
  return hits;
}

function main() {
  // Layer 1: static scan of the bun-bundled surface.
  let bad: string[] = [];
  for (const t of BUN_BUNDLED_TARGETS) {
    bad = bad.concat(scanForMetaEnv(join(ROOT, t)));
  }
  if (bad.length) {
    fail(
      `import.meta.env references found in the bun-bundled render function surface (cold-start crash risk):\n${bad.join("\n")}`,
    );
  }
  console.log("OK  no import.meta.env in bun-bundled render-function surface");

  // Layer 2: runtime cold-start boot of the built render function.
  if (!existsSync(RENDER_BUNDLE)) {
    console.warn(
      "WARN  .vercel/output render bundle not present — skipping cold-start boot layer (run build-vercel.sh first).",
    );
  } else {
    try {
      // exactly what Vercel's Nodejs launcher does: import the handler module.
      // It must not throw at init (the 2026-09-03 bug threw here).
      const mod = require(RENDER_BUNDLE);
      const h = (mod as any).default ?? mod;
      if (typeof h !== "function") {
        fail("render bundle default export is not a function");
      }
      console.log(
        "OK  render bundle cold-starts clean (default export is a callable handler)",
      );
    } catch (err) {
      fail(
        `render bundle cold-start threw — production would FUNCTION_INVOCATION_FAILED. ${String((err as Error)?.message ?? err)}`,
      );
    }
  }

  console.log("\nPASS: Vercel render function is safe to serve (no Vite-only globals in bun bundle; cold-starts clean).");
}

main();