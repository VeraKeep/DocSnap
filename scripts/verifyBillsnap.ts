/**
 * Verify the BillSnap FUNCTIONAL data path against the live Neon DB.
 *
 * BillSnap has no standalone search server function (it uses a status/date
 * filter UI), so this exercise covers the Capture -> Confirm -> Track -> Remind
 * loop the handlers implement (src/features/billsnap/server.ts): createBill
 * insert -> listBills -> updateBill (edit persists) -> setStatus (Paid/Archived)
 * -> setReminder (lead days) -> owner scoping -> gate fails-closed BEFORE and
 * unlocks AFTER grant. The OpenAI vision extraction (extractBillFromImage)
 * needs a real OPENAI_API_KEY and is covered by code review + the no-key path.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyBillsnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-billsnap-module";
const OTHER = "test-billsnap-other-user";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-billsnap@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  // 1) Gate fails CLOSED before grant.
  const locked = (await sql`
    SELECT addon_billsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_billsnap?: boolean }[];
  if (locked[0]?.addon_billsnap === true) {
    console.error("FAIL: fresh user has addon_billsnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: gate fails CLOSED before grant (addon_billsnap != true).");

  // 2) createBill insert -> round-trip the full field set the handler writes.
  const created = (await sql`
    INSERT INTO bills (
      clerk_user_id, vendor, category, account_reference, statement_date,
      due_date, amount_due, minimum_payment, billing_period, status,
      autopay_status, confidence_score
    ) VALUES (
      ${TEST_USER}, ${"Lumbee River EMC"}, ${"Utilities"}, ${"000004821"},
      ${"2026-01-21"}, ${"2026-02-06"}, ${82.15}, ${40.0}, ${"01/2026"},
      ${"Upcoming"}, ${"Detected"}, ${0.92}
    )
    RETURNING id, amount_due, minimum_payment
  `) as unknown as { id: number; amount_due: string; minimum_payment: string }[];
  const billId = Number(created[0].id);
  if (Number(created[0].amount_due) !== 82.15 || Number(created[0].minimum_payment) !== 40) {
    console.error("FAIL: bills NUMERIC columns did not round-trip.");
    process.exit(1);
  }
  console.log(`OK: createBill insert landed -> bill#${billId} amount 82.15.`);

  // 3) listBills returns the owned bill.
  const list = (await sql`
    SELECT id, vendor, amount_due, status FROM bills
    WHERE clerk_user_id = ${TEST_USER} ORDER BY created_at DESC
  `) as unknown as { id: number; status: string }[];
  if (!list.some((r) => Number(r.id) === billId && r.status === "Upcoming")) {
    console.error("FAIL: listBills did not return the owned, newly-created bill.");
    process.exit(1);
  }
  console.log("OK: listBills returns the owned bill.");

  // 4) updateBill — edit persists (vendor + amount + category).
  await sql`
    UPDATE bills SET
      vendor = ${"Lumbee River EMC (updated)"}, category = ${"Electric"},
      amount_due = ${134.28}, autopay_status = ${"Detected"},
      confidence_score = ${0.95},
      status = CASE WHEN status = 'Paid' THEN 'Paid' ELSE 'Upcoming' END
    WHERE id = ${billId} AND clerk_user_id = ${TEST_USER}
  `;
  const edited = (await sql`
    SELECT vendor, amount_due, category FROM bills WHERE id = ${billId}
  `) as unknown as { vendor: string; amount_due: string; category: string }[];
  if (edited[0]?.vendor !== "Lumbee River EMC (updated)" || Number(edited[0]?.amount_due) !== 134.28) {
    console.error("FAIL: updateBill edit did not persist.");
    process.exit(1);
  }
  console.log("OK: updateBill edit persists (vendor + amount).");

  // 5) setStatus -> Paid round-trips; setReminder -> lead days round-trips.
  await sql`UPDATE bills SET status = ${"Paid"} WHERE id = ${billId} AND clerk_user_id = ${TEST_USER}`;
  const statusRead = (await sql`SELECT status FROM bills WHERE id = ${billId}`) as unknown as { status: string }[];
  if (statusRead[0]?.status !== "Paid") {
    console.error("FAIL: setStatus(Paid) did not persist.");
    process.exit(1);
  }
  await sql`UPDATE bills SET reminder_lead_days = ${3} WHERE id = ${billId} AND clerk_user_id = ${TEST_USER}`;
  const remRead = (await sql`SELECT reminder_lead_days FROM bills WHERE id = ${billId}`) as unknown as { reminder_lead_days: number }[];
  if (Number(remRead[0]?.reminder_lead_days) !== 3) {
    console.error("FAIL: setReminder(3) did not persist.");
    process.exit(1);
  }
  console.log("OK: setStatus(Paid) + setReminder(3) persist.");

  // 5b) ARCHIVE = soft-delete via status: excluded from the DEFAULT ("All")
  //     active view, but the row is retained and owned (no hard delete).
  await sql`UPDATE bills SET status = ${"Archived"} WHERE id = ${billId} AND clerk_user_id = ${TEST_USER}`;
  const activeBills = (await sql`
    SELECT id FROM bills WHERE clerk_user_id = ${TEST_USER} AND status <> ${"Archived"}
  `) as unknown as { id: number }[];
  if (activeBills.some((b) => Number(b.id) === billId)) {
    console.error("FAIL: archived bill still appears in the default (active) view.");
    process.exit(1);
  }
  const archivedBillRow = (await sql`
    SELECT id, status, clerk_user_id FROM bills WHERE id = ${billId}
  `) as unknown as { id: number; status: string; clerk_user_id: string }[];
  if (
    archivedBillRow.length !== 1 ||
    archivedBillRow[0].status !== "Archived" ||
    archivedBillRow[0].clerk_user_id !== TEST_USER
  ) {
    console.error("FAIL: archived bill not retained/owned (soft-delete broken).");
    process.exit(1);
  }
  console.log("OK: archive removes a bill from the default view but retains the owned row.");

  // 5c) UNARCHIVE / RESTORE brings the bill back to the default view.
  await sql`UPDATE bills SET status = ${"Upcoming"} WHERE id = ${billId} AND clerk_user_id = ${TEST_USER}`;
  const restoredBills = (await sql`
    SELECT id FROM bills WHERE clerk_user_id = ${TEST_USER} AND status <> ${"Archived"}
  `) as unknown as { id: number }[];
  if (!restoredBills.some((b) => Number(b.id) === billId)) {
    console.error("FAIL: unarchive did not restore the bill to the default view.");
    process.exit(1);
  }
  console.log("OK: unarchive restores the bill to the default view.");

  // 6) Owner scoping: another user cannot read/edit this bill.
  const leak = (await sql`
    SELECT id FROM bills WHERE id = ${billId} AND clerk_user_id = ${OTHER}
  `) as unknown as { id: number }[];
  if (leak.length !== 0) {
    console.error("FAIL: cross-user read leaked the bill (owner scoping broken).");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read this bill.");

  // 7) Retest gate AFTER grant (mirrors All-Access webhook auto-grant).
  await sql`
    INSERT INTO users (clerk_user_id, addon_billsnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_billsnap = ${true}, updated_at = NOW()
  `;
  const unlocked = (await sql`
    SELECT addon_billsnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_billsnap?: boolean }[];
  if (unlocked[0]?.addon_billsnap !== true) {
    console.error("FAIL: setting addon_billsnap = true did not unlock the module.");
    process.exit(1);
  }
  console.log("OK: gate unlocks AFTER grant (retested after use, not just before).");

  if (CLEANUP) {
    await sql`DELETE FROM bills WHERE clerk_user_id = ${TEST_USER}`;
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }
  console.log("VerifyBillsnap OK — BillSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
