/**
 * Verify the waitlist capture round-trip against the live Neon DB, and clean
 * up after itself (the table is left as it was — empty).
 *
 * Exercises the exact SQL the `joinWaitlist` server action runs:
 *   1. INSERT ... ON CONFLICT (email) DO NOTHING   (the action's write)
 *   2. SELECT to confirm the row landed
 *   3. Re-insert the SAME email -> must NOT create a duplicate (UNIQUE dedupe)
 *   4. DELETE the test row -> table left clean
 *
 * Run:  bun scripts/verifyWaitlist.ts
 */
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set — nothing to verify.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const testEmail = `waitlist-test-${Date.now()}@docsnapapp.com`;

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function count(email: string): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM waitlist WHERE email = ${email}`) as {
    n: number;
  }[];
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  console.log(`Test email: ${testEmail}`);

  // 1. The action's write: INSERT ... ON CONFLICT (email) DO NOTHING
  await sql`INSERT INTO waitlist (email) VALUES (${testEmail}) ON CONFLICT (email) DO NOTHING`;

  const afterInsert = await count(testEmail);
  if (afterInsert !== 1) fail(`expected 1 row after insert, got ${afterInsert}`);
  console.log(`OK  insert landed → 1 row`);

  // 2. Confirm the row exists and has the expected shape.
  const rows = (await sql`SELECT id, email, created_at FROM waitlist WHERE email = ${testEmail}`) as {
    id: number;
    email: string;
    created_at: string;
  }[];
  if (rows.length !== 1) fail("could not read back the inserted row");
  if (rows[0].email !== testEmail) fail("email column mismatch");
  if (!rows[0].created_at) fail("created_at is missing — schema drift?");
  console.log(`OK  row shape: id=${rows[0].id} email=${rows[0].email} created_at=${rows[0].created_at}`);

  // 3. Dedupe: inserting the same email again must NOT add a row.
  await sql`INSERT INTO waitlist (email) VALUES (${testEmail}) ON CONFLICT (email) DO NOTHING`;
  const afterDedupe = await count(testEmail);
  if (afterDedupe !== 1) fail(`expected 1 row after dedupe, got ${afterDedupe}`);
  console.log("OK  dedupe holds — re-insert produced no duplicate row");

  // 4. Self-clean: delete the test row and confirm the table is left empty.
  await sql`DELETE FROM waitlist WHERE email = ${testEmail}`;
  const afterCleanup = await count(testEmail);
  if (afterCleanup !== 0) fail(`expected 0 rows after cleanup, got ${afterCleanup}`);
  console.log("OK  cleaned up test row → 0 rows for it remain");

  console.log("\nPASS: waitlist insert/dedupe/cleanup verified against live DB.");
}

main().catch((err) => fail(String(err?.message ?? err)));
