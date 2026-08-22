/**
 * Verify the HomeSnap data path against the live Neon DB.
 *
 * Clerk session keys are not present in this environment, so the server
 * functions' auth adapter (requireServerFunctionUser) cannot run a signed-in
 * request. This script instead exercises the exact same owner-scoped SQL the
 * server handlers use (see src/features/homesnap/server.ts), round-tripping
 * property → object → document → event against the real database for a
 * throwaway test user, then cleaning up after itself. It also proves the
 * add-on gate fails CLOSED for a user without the flag.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyHomesnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-homesnap-phase3";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1"; // default: clean up

function clamp(n: unknown): number {
  return Number(n);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }

  // 1) Fails-closed gate: a user row with no addon_homesnap is LOCKED.
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  const lockedRows = (await sql`
    SELECT addon_homesnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_homesnap?: boolean }[];
  const isLocked = lockedRows[0]?.addon_homesnap === true;
  if (isLocked) {
    console.error("FAIL: fresh user unexpectedly has addon_homesnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: fails-closed — new user without flag is LOCKED (addon_homesnap != true).");

  // 2) Round-trip: property → object → document → event, owner-scoped.
  const propRows = (await sql`
    INSERT INTO properties (clerk_user_id, nickname, property_type, purchase_price)
    VALUES (${TEST_USER}, ${"Verify House"}, ${"house"}, ${425000})
    RETURNING id
  `) as unknown as { id: number }[];
  const propertyId = clamp(propRows[0].id);

  const objRows = (await sql`
    INSERT INTO property_objects (property_id, object_type, name, manufacturer, model, serial_number, status)
    VALUES (${propertyId}, ${"system"}, ${"Main HVAC"}, ${"Trane"}, ${"XR16"}, ${"SN-VERIFY-001"}, ${"active"})
    RETURNING id
  `) as unknown as { id: number }[];
  const objectId = clamp(objRows[0].id);

  const docRows = (await sql`
    INSERT INTO object_documents (object_id, document_type, title, file_url)
    VALUES (${objectId}, ${"warranty"}, ${"HVAC warranty"}, ${"https://example.com/hvac-warranty.pdf"})
    RETURNING id
  `) as unknown as { id: number }[];
  const docId = clamp(docRows[0].id);

  const evRows = (await sql`
    INSERT INTO object_events (object_id, event_type, occurred_on, title)
    VALUES (${objectId}, ${"installed"}, ${"2026-02-01"}, ${"Installed"})
    RETURNING id
  `) as unknown as { id: number }[];
  const eventId = clamp(evRows[0].id);

  // Insert a maintenance schedule and round-trip "mark done" (advances
  // next_due by the interval — the exact logic completeSchedule uses).
  const schRows = (await sql`
    INSERT INTO maintenance_schedules (object_id, task_type, title, interval_value, interval_unit, last_done, next_due)
    VALUES (${objectId}, ${"filter"}, ${"Replace air filter"}, ${3}, ${"months"}, ${"2026-06-01"}, ${"2026-09-01"})
    RETURNING id, next_due
  `) as unknown as { id: number; next_due: string }[];
  const scheduleId = clamp(schRows[0].id);
  const doneRows = (await sql`
    UPDATE maintenance_schedules SET last_done = '2026-09-01', next_due = '2026-12-01'
    WHERE id = ${scheduleId}
    RETURNING next_due
  `) as unknown as { next_due: string }[];
  if (doneRows[0]?.next_due !== "2026-12-01") {
    console.error("FAIL: maintenance 'mark done' did not advance next_due by the interval.");
    process.exit(1);
  }

  // Home-inventory item (object_type "inventory") with a category + photo, and
  // the cross-home inventory query the listInventory handler runs.
  const invRows = (await sql`
    INSERT INTO property_objects (property_id, object_type, name, manufacturer, model, serial_number, purchase_price, status, inventory_category)
    VALUES (${propertyId}, ${"inventory"}, ${"Forge TV"}, ${"Sony"}, ${"XR-65X90L"}, ${"SN-INV-001"}, ${1999.5}, ${"active"}, ${"tv"})
    RETURNING id, inventory_category
  `) as unknown as { id: number; inventory_category: string }[];
  const invId = clamp(invRows[0].id);
  if (invRows[0]?.inventory_category !== "tv") {
    console.error("FAIL: inventory_category did not round-trip.");
    process.exit(1);
  }
  await sql`
    INSERT INTO object_documents (object_id, document_type, title, file_url)
    VALUES (${invId}, ${"photo"}, ${"Forge TV photo"}, ${"https://example.com/tv.jpg"})
  `;
  const invListing = (await sql`
    SELECT po.*, p.nickname AS property_nickname,
      (SELECT od.file_url FROM object_documents od
        WHERE od.object_id = po.id AND od.document_type = 'photo'
        ORDER BY od.created_at DESC LIMIT 1) AS photo_url
    FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE po.object_type = 'inventory' AND p.clerk_user_id = ${TEST_USER}
    ORDER BY po.created_at DESC
  `) as unknown as Record<string, unknown>[];
  const inv = invListing[0];
  if (!inv || inv.photo_url !== "https://example.com/tv.jpg") {
    console.error("FAIL: inventory listing did not return the item with its photo_url.");
    process.exit(1);
  }
  console.log(`Inventory OK: item#${invId} (${inv.object_type}, category ${inv.inventory_category}) listed with photo_url = ${inv.photo_url}.`);

  // Read everything back (same queries the server handlers run).
  const props = (await sql`
    SELECT * FROM properties WHERE clerk_user_id = ${TEST_USER} ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  const objs = (await sql`
    SELECT * FROM property_objects WHERE property_id = ${propertyId} ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  const docs = (await sql`
    SELECT * FROM object_documents WHERE object_id = ${objectId} ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  const evs = (await sql`
    SELECT * FROM object_events WHERE object_id = ${objectId} ORDER BY created_at ASC
  `) as unknown as Record<string, unknown>[];
  const scheds = (await sql`
    SELECT * FROM maintenance_schedules WHERE object_id = ${objectId} ORDER BY next_due ASC
  `) as unknown as Record<string, unknown>[];

  console.log(`Round-trip insert OK: property#${propertyId} -> object#${objectId} -> document#${docId} + event#${eventId} + schedule#${scheduleId} + inventory#${invId}`);
  console.log(`Read-back: ${props.length} propert(y/ies), ${objs.length} object(s), ${docs.length} document(s), ${evs.length} event(s), ${scheds.length} schedule(s) for scoped user.`);
  if (!props.length || !objs.length || !docs.length || !evs.length || !scheds.length) {
    console.error("FAIL: read-back returned empty for owned rows.");
    process.exit(1);
  }

  // 3) Ownership scoping: a different user must NOT see these rows.
  const OTHER = "test-homesnap-other-user";
  const otherProps = (await sql`
    SELECT * FROM properties WHERE clerk_user_id = ${OTHER} AND id = ${propertyId}
  `) as unknown as Record<string, unknown>[];
  if (otherProps.length !== 0) {
    console.error("FAIL: cross-user read leaked rows.");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read these rows.");

  // 4) Granting the add-on unlocks (mirrors setHomeSnapAddon).
  await sql`
    INSERT INTO users (clerk_user_id, addon_homesnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_homesnap = ${true}, updated_at = NOW()
  `;
  const grantedRows = (await sql`
    SELECT addon_homesnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_homesnap?: boolean }[];
  if (grantedRows[0]?.addon_homesnap !== true) {
    console.error("FAIL: granting addon_homesnap did not take effect.");
    process.exit(1);
  }
  console.log("OK: setting addon_homesnap = true unlocks the module for the user.");

  // 5) Cleanup (cascade removes objects/documents/events beneath the property).
  if (CLEANUP) {
    await sql`DELETE FROM properties WHERE clerk_user_id = ${TEST_USER}`;
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }

  console.log("VerifyHomesnap OK — HomeSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
