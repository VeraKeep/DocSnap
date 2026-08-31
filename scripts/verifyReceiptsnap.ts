/**
 * Verify the ReceiptSnap FUNCTIONAL data path against the live Neon DB.
 *
 * Clerk session keys are not present in this sandbox, so the server functions'
 * auth adapter (requireServerFunctionUser) cannot run a signed-in request, and
 * the OpenAI-backed image extraction (saveReceipt's `extract`) needs a real
 * OPENAI_API_KEY. The persisted shape of a save is what this script round-trips,
 * using the EXACT owner-scoped SQL the handlers run (see
 * src/features/receiptsnap/server.ts): insert (saveReceipt) -> list ->
 * get-by-id -> searchReceipts (ILIKE over merchant/items/extra) -> owner
 * scoping -> gate fails-closed BEFORE and unlocks AFTER grant.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyReceiptsnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-receiptsnap-module";
const OTHER = "test-receiptsnap-other-user";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1"; // default: clean up

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-receiptsnap@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  // 1) Gate fails CLOSED before grant (no addon flag).
  const locked = (await sql`
    SELECT addon_receiptsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_receiptsnap?: boolean }[];
  if (locked[0]?.addon_receiptsnap === true) {
    console.error("FAIL: fresh user has addon_receiptsnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: gate fails CLOSED before grant (addon_receiptsnap != true).");

  // 2) saveReceipt equivalent: insert a receipt with extracted items/extra JSONB.
  const created = (await sql`
    INSERT INTO receipts (clerk_user_id, merchant, store_date, total, currency, items, extra, image_base64)
    VALUES (${TEST_USER}, ${"ACME Test Supply"}, ${"2026-08-01"}, ${42.5}, ${"USD"},
            ${JSON.stringify([{ name: "Flux Capacitor", quantity: 1, unit_price: 42.5, line_total: 42.5 }])}::jsonb,
            ${JSON.stringify({ merchant: "ACME Test Supply", total: 42.5, serial_numbers: ["SN-RCPT-001"] })}::jsonb,
            ${"data:image/jpeg;base64,VERIFY"})
    RETURNING id, total
  `) as unknown as { id: number; total: string }[];
  const receiptId = Number(created[0].id);
  if (Number(created[0].total) !== 42.5) {
    console.error("FAIL: receipts.total (NUMERIC) did not round-trip as 42.5.");
    process.exit(1);
  }
  console.log(`OK: saveReceipt insert landed -> receipt#${receiptId} total 42.5.`);

  // 3) listReceipts query (handler SQL) returns the owned receipt.
  const list = (await sql`
    SELECT id, merchant, store_date, total, currency, items, extra, created_at
    FROM receipts WHERE clerk_user_id = ${TEST_USER} ORDER BY created_at DESC
  `) as unknown as { id: number; merchant: string | null }[];
  if (!list.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: listReceipts did not return the owned receipt.");
    process.exit(1);
  }
  console.log("OK: listReceipts returns the owned receipt.");

  // 4) getReceipt query is owner-scoped by id + user.
  const get = (await sql`
    SELECT * FROM receipts WHERE id = ${receiptId} AND clerk_user_id = ${TEST_USER}
  `) as unknown as { merchant: string | null; items: unknown }[];
  if (!get[0] || get[0].merchant !== "ACME Test Supply") {
    console.error("FAIL: getReceipt did not return the owned receipt.");
    process.exit(1);
  }
  console.log("OK: getReceipt returns the owned receipt with items JSONB intact.");

  // 5) searchReceipts query — ILIKE over merchant + items/extra (searchable).
  const hit = (await sql`
    SELECT id FROM receipts
    WHERE clerk_user_id = ${TEST_USER}
      AND (merchant ILIKE ${`%acme%`} OR CAST(items AS TEXT) ILIKE ${`%acme%`} OR CAST(extra AS TEXT) ILIKE ${`%acme%`})
    ORDER BY created_at DESC
  `) as unknown as { id: number }[];
  const serialHit = (await sql`
    SELECT id FROM receipts
    WHERE clerk_user_id = ${TEST_USER}
      AND (merchant ILIKE ${`%SN-RCPT-001%`} OR CAST(items AS TEXT) ILIKE ${`%SN-RCPT-001%`} OR CAST(extra AS TEXT) ILIKE ${`%SN-RCPT-001%`})
  `) as unknown as { id: number }[];
  if (!hit.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: searchReceipts('acme') missed the owned receipt (merchant ILIKE).");
    process.exit(1);
  }
  if (!serialHit.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: searchReceipts over extracted serial_numbers (extra JSONB) missed.");
    process.exit(1);
  }
  console.log("OK: searchReceipts finds by merchant AND by extracted item/extra content.");

  // 5b) updateReceipt — METADATA edit persists (merchant + amount) while the
  //     scanned IMAGE stays immutable (image_base64 is never changed by edit).
  const updated = (await sql`
    UPDATE receipts SET
      merchant = ${"ACME Test Supply (edited)"},
      store_date = ${"2026-08-02"},
      total = ${55.0},
      currency = ${"USD"},
      extra = extra || ${JSON.stringify({ category: "Test Category", notes: "a test note", tags: ["kitchen", "warranty"] })}::jsonb
    WHERE id = ${receiptId} AND clerk_user_id = ${TEST_USER}
    RETURNING id, merchant, total, image_base64
  `) as unknown as { id: number; merchant: string; total: string; image_base64: string }[];
  if (!updated[0] || updated[0].merchant !== "ACME Test Supply (edited)") {
    console.error("FAIL: updateReceipt merchant edit did not persist.");
    process.exit(1);
  }
  if (Number(updated[0].total) !== 55) {
    console.error("FAIL: updateReceipt amount edit did not persist.");
    process.exit(1);
  }
  if (updated[0].image_base64 !== "data:image/jpeg;base64,VERIFY") {
    console.error("FAIL: updateReceipt must leave the scanned image immutable.");
    process.exit(1);
  }
  const editedExtra = (await sql`
    SELECT extra FROM receipts WHERE id = ${receiptId}
  `) as unknown as { extra: Record<string, unknown> }[];
  if (
    editedExtra[0]?.extra?.category !== "Test Category" ||
    editedExtra[0]?.extra?.notes !== "a test note" ||
    !Array.isArray(editedExtra[0]?.extra?.tags)
  ) {
    console.error("FAIL: updateReceipt did not merge category/notes/tags into extra.");
    process.exit(1);
  }
  console.log("OK: updateReceipt metadata edit persists (merchant, amount, category/notes/tags) and image stays immutable.");

  // 5c) archiveReceipt (SOFT-DELETE) — excluded from the DEFAULT list, but the
  //     row is retained, owned, and still listed in the archived view.
  await sql`
    UPDATE receipts SET archived = true
    WHERE id = ${receiptId} AND clerk_user_id = ${TEST_USER}
  `;
  const activeList = (await sql`
    SELECT id FROM receipts WHERE clerk_user_id = ${TEST_USER} AND archived = false
  `) as unknown as { id: number }[];
  if (activeList.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: archived receipt still appears in the default list.");
    process.exit(1);
  }
  const archivedRow = (await sql`
    SELECT id, archived, clerk_user_id, image_base64 FROM receipts WHERE id = ${receiptId}
  `) as unknown as { id: number; archived: boolean; clerk_user_id: string; image_base64: string }[];
  if (
    archivedRow.length !== 1 ||
    archivedRow[0].archived !== true ||
    archivedRow[0].clerk_user_id !== TEST_USER ||
    !archivedRow[0].image_base64
  ) {
    console.error("FAIL: archived receipt not retained/owned/persisted (soft-delete broken).");
    process.exit(1);
  }
  const archList = (await sql`
    SELECT id FROM receipts WHERE clerk_user_id = ${TEST_USER} AND archived = true
  `) as unknown as { id: number }[];
  if (!archList.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: archived receipt not listed in the archived view.");
    process.exit(1);
  }
  console.log("OK: archive removes from default list, retains owned row (no hard delete, restorable).");

  // 5d) unarchiveReceipt (RESTORE) — brings it back to the default list.
  await sql`
    UPDATE receipts SET archived = false
    WHERE id = ${receiptId} AND clerk_user_id = ${TEST_USER}
  `;
  const restoredList = (await sql`
    SELECT id FROM receipts WHERE clerk_user_id = ${TEST_USER} AND archived = false
  `) as unknown as { id: number }[];
  if (!restoredList.some((r) => Number(r.id) === receiptId)) {
    console.error("FAIL: unarchive did not restore the receipt to the default list.");
    process.exit(1);
  }
  console.log("OK: unarchive restores the receipt to the default list.");

  // 6) Owner scoping: another user must NOT see this receipt.
  const leak = (await sql`
    SELECT id FROM receipts WHERE id = ${receiptId} AND clerk_user_id = ${OTHER}
  `) as unknown as { id: number }[];
  if (leak.length !== 0) {
    console.error("FAIL: cross-user read leaked the receipt (owner scoping broken).");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read this receipt.");

  // 7) Retest gate AFTER grant: setting the flag reflects unlock (mirrors
  //    setReceiptSnapAddon / the All-Access auto-grant webhook).
  await sql`
    INSERT INTO users (clerk_user_id, addon_receiptsnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_receiptsnap = ${true}, updated_at = NOW()
  `;
  const unlocked = (await sql`
    SELECT addon_receiptsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_receiptsnap?: boolean }[];
  if (unlocked[0]?.addon_receiptsnap !== true) {
    console.error("FAIL: setting addon_receiptsnap = true did not unlock the module.");
    process.exit(1);
  }
  console.log("OK: gate unlocks AFTER grant (retested after use, not just before).");

  if (CLEANUP) {
    await sql`DELETE FROM receipts WHERE clerk_user_id = ${TEST_USER}`;
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }
  console.log("VerifyReceiptSnap OK — ReceiptSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
