/**
 * Apply src/db-schema.sql to the connected Neon database.
 *
 * Read-only about the connection string: DATABASE_URL is read from the
 * environment and never printed. The schema file is idempotent
 * (CREATE TABLE IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS), so it is
 * safe to run repeatedly against any state.
 *
 * The SQL file is split into individual statements and each is executed with
 * the neon driver's `query()` (the `unsafe()`/plain-string path is a no-op on
 * this driver version, so per-statement `query()` is used instead).
 *
 * Run:  bun scripts/applySchema.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set — nothing to apply.");
  process.exit(1);
}

const schemaPath = fileURLToPath(
  new URL("../src/db-schema.sql", import.meta.url),
);
const raw = readFileSync(schemaPath, "utf8");

// Strip `--` line comments (this schema has no in-string semicolons), then
// split into individual statements on `;`.
const statements = raw
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const sql = neon(databaseUrl, { fetchOptions: { cache: "no-store" } });

async function main() {
  console.log(`Applying ${statements.length} statements from ${schemaPath} ...`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await sql.query(stmt);
    } catch (err) {
      const firstLine = stmt.split("\n")[0].slice(0, 80);
      console.error(`Statement ${i + 1} FAILED (${firstLine}):`);
      console.error(String(err).slice(0, 400));
      process.exit(1);
    }
  }
  console.log("All statements applied (idempotent).");

  // Verify from a FRESH process: Neon's pooled endpoint can leave the process
  // that issued the DDL reading a stale snapshot, but a freshly-spawned bun
  // process reliably observes the committed schema. Verification is read-only.
  const verifySrc = `
    const { neon } = await import(${JSON.stringify("@neondatabase/serverless")});
    const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
    const want = ["users","webhook_events","share_links","receipts","meetings","meeting_extractions","bills","waitlist","properties","property_objects","object_documents","object_events","contracts","contract_clauses","contract_events","contract_reminders"];
    for (let i = 0; i < 12; i++) {
      const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
      const have = new Set(rows.map(r => r.table_name));
      if (want.every(t => have.has(t))) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    const have = new Set(rows.map(r => r.table_name));
    const missing = want.filter(t => !have.has(t));
    if (missing.length) { console.log("VERIFY_FAIL tables_missing=" + missing.join(",")); process.exit(2); }
    const cols = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='addon_homesnap'");
    if (cols.length !== 1) { console.log("VERIFY_FAIL no_addon_homesnap"); process.exit(2); }
    const csCols = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='addon_contractsnap'");
    if (csCols.length !== 1) { console.log("VERIFY_FAIL no_addon_contractsnap"); process.exit(2); }
    console.log("VERIFY_OK tables=" + rows.length + " addon_homesnap=present addon_contractsnap=present");
    console.log("PUBLIC_TABLES=" + rows.map(r => r.table_name).join(","));
  `;
  try {
    execFileSync("bun", ["-e", verifySrc], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
  } catch (err) {
    const code = (err as { status?: number }).status;
    console.error(code === 2 ? "Verification FAILED — schema missing on DB." : "Verification subprocess error.");
    process.exit(1);
  }
  console.log("Schema apply + verification OK.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
