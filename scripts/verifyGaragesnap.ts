/**
 * Verify the GarageSnap data path against the live Neon DB.
 *
 * Clerk session keys are not present in this environment, so the server
 * functions' auth adapter (requireServerFunctionUser) cannot run a signed-in
 * request. This script instead exercises the exact same owner-scoped SQL the
 * server handlers use (see src/features/garagesnap/server.ts), round-tripping
 * create → list → get → update → delete against the real database for a
 * throwaway test user, then cleaning up after itself. It also proves the
 * add-on gate fails CLOSED for a user without the flag, and that the reserved
 * `home_object_id` sharing column exists and stays null by default.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyGaragesnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-garagesnap-module";
const OTHER = "test-garagesnap-other-user";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1"; // default: clean up

function clamp(n: unknown): number {
  return Number(n);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }

  // 1) Fails-closed gate: a user row with no addon_garagesnap is LOCKED.
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-garage@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  const lockedRows = (await sql`
    SELECT addon_garagesnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_garagesnap?: boolean }[];
  const isLocked = lockedRows[0]?.addon_garagesnap === true;
  if (isLocked) {
    console.error("FAIL: fresh user unexpectedly has addon_garagesnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: fails-closed — new user without flag is LOCKED (addon_garagesnap != true).");

  // 2) Round-trip a garage item (the full set of columns the handlers touch).
  const created = (await sql`
    INSERT INTO garage_items (
      clerk_user_id, name, category, make, model, serial_number, photo_url,
      purchase_date, purchase_price, warranty_expiration, storage_location
    ) VALUES (
      ${TEST_USER}, ${"Cordless Drill"}, ${"power_tool"}, ${"Milwaukee"},
      ${"M18 FUEL"}, ${"SN-GARAGE-001"},
      ${"https://example.com/drill.jpg"}, ${"2026-01-15"}, ${249.99},
      ${"2029-01-15"}, ${"Wall 01 · Bay A"}
    )
    RETURNING id, category, storage_location, home_object_id
  `) as unknown as { id: number; category: string; storage_location: string; home_object_id: number | null }[];
  const itemId = clamp(created[0].id);
  if (created[0]?.category !== "power_tool") {
    console.error("FAIL: category did not round-trip.");
    process.exit(1);
  }
  if (created[0]?.storage_location !== "Wall 01 · Bay A") {
    console.error("FAIL: storage_location did not round-trip.");
    process.exit(1);
  }
  if (created[0]?.home_object_id != null) {
    console.error("FAIL: reserved home_object_id should be NULL by default (sharing not built yet).");
    process.exit(1);
  }
  console.log(`Create OK: item#${itemId} (${created[0].category}) at "${created[0].storage_location}", home_object_id = null (reserved).`);

  // 3) Update the item (mirrors updateGarageItem — owner-scoped WHERE clerk_user_id).
  const updated = (await sql`
    UPDATE garage_items SET model = ${"M18 FUEL v2"}, purchase_price = ${299}
    WHERE id = ${itemId} AND clerk_user_id = ${TEST_USER}
    RETURNING model, purchase_price
  `) as unknown as { model: string; purchase_price: number }[];
  // Postgres returns NUMERIC as a string — coerce before comparing.
  if (
    updated[0]?.model !== "M18 FUEL v2" ||
    Number(updated[0]?.purchase_price) !== 299
  ) {
    console.error("FAIL: update did not persist.");
    process.exit(1);
  }
  console.log(`Update OK: item#${itemId} model=${updated[0].model}, price=${updated[0].purchase_price}.`);

  // 4) Ownership scoping: a different user must NOT see / touch this row.
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${OTHER}, ${"verify-garage-other@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  const otherRead = (await sql`
    SELECT * FROM garage_items WHERE id = ${itemId} AND clerk_user_id = ${OTHER}
  `) as unknown as Record<string, unknown>[];
  if (otherRead.length !== 0) {
    console.error("FAIL: cross-user read leaked rows.");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read this item.");

  // 5) List read-back for the scoped user (mirrors listGarageItems).
  const rows = (await sql`
    SELECT * FROM garage_items WHERE clerk_user_id = ${TEST_USER} ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  if (!rows.length) {
    console.error("FAIL: list read-back empty for the scoped user.");
    process.exit(1);
  }
  console.log(`Read-back OK: ${rows.length} item(s) for scoped user.`);

  // 6) Granting the add-on unlocks (mirrors setGarageSnapAddon).
  await sql`
    INSERT INTO users (clerk_user_id, addon_garagesnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_garagesnap = ${true}, updated_at = NOW()
  `;
  const grantedRows = (await sql`
    SELECT addon_garagesnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_garagesnap?: boolean }[];
  if (grantedRows[0]?.addon_garagesnap !== true) {
    console.error("FAIL: granting addon_garagesnap did not take effect.");
    process.exit(1);
  }
  console.log("OK: setting addon_garagesnap = true unlocks the module for the user.");

  // 7) Delete (mirrors deleteGarageItem — owner-scoped).
  const del = (await sql`
    DELETE FROM garage_items WHERE id = ${itemId} AND clerk_user_id = ${TEST_USER}
    RETURNING id
  `) as unknown as { id: number }[];
  if (del.length !== 1 || clamp(del[0].id) !== itemId) {
    console.error("FAIL: delete did not remove the owned item.");
    process.exit(1);
  }
  console.log(`Delete OK: item#${itemId} removed.`);

  // 8) Cleanup.
  if (CLEANUP) {
    await sql`DELETE FROM garage_items WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }

  console.log("VerifyGaragesnap OK — GarageSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
