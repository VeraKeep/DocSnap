// Run with PGLITE_TEST_MODULE pointing to an installed @electric-sql/pglite module.
// Executes production SQL in PostgreSQL/WASM; it does not model multiple connections.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const { PGlite } = await import(process.env.PGLITE_TEST_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const root = path.resolve(import.meta.dirname, "..");
function load(file, mocks = {}) {
  const filename = path.join(root, file), module = { exports: {} }, require = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: id => id in mocks ? mocks[id] : require(id), process, console, structuredClone, Date, Map }, { filename });
  return module.exports;
}
function sql(strings, ...params) {
  const text = strings.reduce((result, part, i) => result + (i ? `$${i}` : "") + part, "");
  return { text, params, then(resolve, reject) { return db.query(text, params).then(r => r.rows).then(resolve, reject); } };
}
sql.transaction = async (queries, options) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  return db.transaction(async tx => {
    const results = [];
    for (const q of queries) results.push((await tx.query(q.text, q.params)).rows);
    return results;
  });
};
function tableDDL(schema, table) {
  const match = schema.match(new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table} \([\s\S]*?\n\);`, "i"));
  assert.ok(match, `Missing schema table ${table}`);
  return match[0];
}
const schema = fs.readFileSync(path.join(root, "src/db-schema.sql"), "utf8");
await db.exec(["users", "meetings", "meeting_extractions"].map(t => tableDDL(schema, t)).join("\n"));
const persistence = load("src/features/meetingsnap/persistence.ts", {
  "~/db": { getDatabaseClient: () => sql },
  "./tiers": load("src/features/meetingsnap/tiers.ts"),
});
const { reserveMeeting, completeMeeting, releaseMeeting } = persistence;
const first = await reserveMeeting("free-owner");
await reserveMeeting("free-owner");
await assert.rejects(() => reserveMeeting("free-owner"), /allowance/);
await releaseMeeting("other-owner", first);
assert.equal((await db.query("SELECT count(*)::int AS n FROM meetings")).rows[0].n, 2);
await releaseMeeting("free-owner", first);
const replacement = await reserveMeeting("free-owner");
await assert.rejects(() => reserveMeeting("audio-free", true), /allowance/);
assert.equal((await db.query("SELECT count(*)::int AS n FROM meetings WHERE clerk_user_id='audio-free'")).rows[0].n, 0);
await db.exec("ALTER TABLE meeting_extractions ADD CONSTRAINT extraction_failure CHECK (NOT extraction ? 'reject')");
await assert.rejects(() => completeMeeting("free-owner", replacement, "Title", "Real transcript", { reject: true }), /extraction_failure/);
assert.equal((await db.query("SELECT source_text FROM meetings WHERE id=$1", [replacement.id])).rows[0].source_text, "");
assert.equal((await db.query("SELECT count(*)::int AS n FROM meeting_extractions")).rows[0].n, 0);
await assert.rejects(() => completeMeeting("other-owner", replacement, "Title", "Real transcript", {}), /expired/);
await completeMeeting("free-owner", replacement, "Title", "Real transcript", { summary: "Saved" });
await releaseMeeting("free-owner", replacement);
assert.equal((await db.query("SELECT source_text FROM meetings WHERE id=$1", [replacement.id])).rows[0].source_text, "Real transcript");
assert.equal((await db.query("SELECT count(*)::int AS n FROM meeting_extractions")).rows[0].n, 1);
await db.exec("UPDATE meetings SET created_at=now()-interval '16 minutes' WHERE source_text=''");
await reserveMeeting("free-owner");
await assert.rejects(() => completeMeeting("free-owner", first, "Late", "Late transcript", {}), /expired/);
await db.exec("INSERT INTO users(clerk_user_id,meeting_subscription_status) VALUES('paid-owner','personal')");
const paid = await reserveMeeting("paid-owner", true);
assert.equal(paid.tier, "personal");
await db.close();
console.log("MeetingSnap SQL checks passed: quota, paid audio, ownership, stale leases, atomic extraction rollback.");
