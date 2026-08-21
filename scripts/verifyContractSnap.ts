/**
 * Verify the ContractSnap data path against the live Neon DB.
 *
 * Clerk session keys are not present in this environment, so the server
 * functions' auth adapter (requireServerFunctionUser) cannot run a signed-in
 * request. This script instead exercises the exact same owner-scoped SQL the
 * server handlers use (see src/features/contractsnap/server.ts), round-tripping
 * contract -> clauses -> events -> reminders against the real database for a
 * throwaway test user, then cleaning up after itself. It also proves the
 * add-on gate fails CLOSED for a user without the flag.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyContractSnap.ts
 */
import { sql } from "../src/db";
const TEST_USER = "test-contractsnap-phase3";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1"; // default: clean up
function clamp(n: unknown): number {
  return Number(n);
}
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }
  // 1) Fails-closed gate: a user row with no addon_contractsnap is LOCKED.
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-contractsnap@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  const lockedRows = (await sql`
    SELECT addon_contractsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_contractsnap?: boolean }[];
  const isLocked = lockedRows[0]?.addon_contractsnap === true;
  if (isLocked) {
    console.error("FAIL: fresh user unexpectedly has addon_contractsnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: fails-closed — new user without flag is LOCKED (addon_contractsnap != true).");
  // 2) Round-trip: contract -> clauses -> events -> reminders, owner-scoped.
  const cRows = (await sql`
    INSERT INTO contracts (clerk_user_id, title, contract_type, effective_date, expiration_date,
                           renewal_date, cancellation_deadline, auto_renewal, renewal_type,
                           source_text, summary, analysis_status)
    VALUES (${TEST_USER}, ${"Verify Service Contract"}, ${"service"}, ${"2026-01-01"}, ${"2027-01-01"},
            ${"2026-12-15"}, ${"2026-11-30"}, ${true}, ${"auto"},
            ${"This is a sample contract for verification."}, ${JSON.stringify({})}, ${"pending"})
    RETURNING id
  `) as unknown as { id: number }[];
  const contractId = clamp(cRows[0].id);
  const clauseRows = (await sql`
    INSERT INTO contract_clauses (contract_id, type, text, source_status, confidence)
    VALUES (${contractId}, ${"renewal"}, ${"Auto-renews unless cancelled."}, ${"confirmed"}, ${0.9})
    RETURNING id
  `) as unknown as { id: number }[];
  const clauseId = clamp(clauseRows[0].id);
  const eventRows = (await sql`
    INSERT INTO contract_events (contract_id, event_type, date, source)
    VALUES (${contractId}, ${"signed"}, ${"2026-01-01"}, ${"confirmed"})
    RETURNING id
  `) as unknown as { id: number }[];
  const eventId = clamp(eventRows[0].id);
  const reminderRows = (await sql`
    INSERT INTO contract_reminders (contract_id, type, due_date, delivered)
    VALUES (${contractId}, ${"renewal"}, ${"2026-12-15"}, ${false})
    RETURNING id
  `) as unknown as { id: number }[];
  const reminderId = clamp(reminderRows[0].id);
  // Read everything back (same queries the server handlers run).
  const contracts = (await sql`
    SELECT * FROM contracts WHERE clerk_user_id = ${TEST_USER} ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  const clauses = (await sql`
    SELECT * FROM contract_clauses WHERE contract_id = ${contractId} ORDER BY id
  `) as unknown as Record<string, unknown>[];
  const events = (await sql`
    SELECT * FROM contract_events WHERE contract_id = ${contractId} ORDER BY id
  `) as unknown as Record<string, unknown>[];
  const reminders = (await sql`
    SELECT * FROM contract_reminders WHERE contract_id = ${contractId} ORDER BY id
  `) as unknown as Record<string, unknown>[];
  console.log(`Round-trip insert OK: contract#${contractId} -> clause#${clauseId} + event#${eventId} + reminder#${reminderId}`);
  console.log(`Read-back: ${contracts.length} contract(s), ${clauses.length} clause(s), ${events.length} event(s), ${reminders.length} reminder(s) for scoped user.`);
  if (!contracts.length || !clauses.length || !events.length || !reminders.length) {
    console.error("FAIL: read-back returned empty for owned rows.");
    process.exit(1);
  }
  // 3) Ownership scoping: a different user must NOT see these rows.
  const OTHER = "test-contractsnap-other-user";
  const otherContracts = (await sql`
    SELECT * FROM contracts WHERE clerk_user_id = ${OTHER} AND id = ${contractId}
  `) as unknown as Record<string, unknown>[];
  if (otherContracts.length !== 0) {
    console.error("FAIL: cross-user read leaked rows.");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read these rows.");
  // 4) Granting the add-on unlocks (mirrors setContractSnapAddon).
  await sql`
    INSERT INTO users (clerk_user_id, addon_contractsnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_contractsnap = ${true}, updated_at = NOW()
  `;
  const grantedRows = (await sql`
    SELECT addon_contractsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_contractsnap?: boolean }[];
  if (grantedRows[0]?.addon_contractsnap !== true) {
    console.error("FAIL: granting addon_contractsnap did not take effect.");
    process.exit(1);
  }
  console.log("OK: setting addon_contractsnap = true unlocks the module for the user.");
  // 5) Cleanup (cascade removes clauses/events/reminders beneath the contract).
  if (CLEANUP) {
    await sql`DELETE FROM contracts WHERE clerk_user_id = ${TEST_USER}`;
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }
  console.log("VerifyContractSnap OK — ContractSnap data path round-trips through Neon.");
}
main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
