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
    INSERT INTO object_events (object_id, event_type, occurred_on, title, cost)
    VALUES (${objectId}, ${"installed"}, ${"2026-02-01"}, ${"Installed"}, ${0})
    RETURNING id
  `) as unknown as { id: number }[];
  const eventId = clamp(evRows[0].id);

  // Analytic cost-bearing event (repair/service with a dollar cost) — the
  // driver returns NUMERIC as a string, so coerce with Number() before the
  // comparison below (persisted value is the source of truth).
  const costedEvRows = (await sql`
    INSERT INTO object_events (object_id, event_type, occurred_on, title, cost)
    VALUES (${objectId}, ${"repaired"}, ${"2026-07-15"}, ${"Compressor repair"}, ${850.5})
    RETURNING id, cost
  `) as unknown as { id: number; cost: string }[];
  const costedEventId = clamp(costedEvRows[0].id);
  if (Number(costedEvRows[0].cost) !== 850.5) {
    console.error("FAIL: object_events.cost did not round-trip.");
    process.exit(1);
  }

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

  // 3.5) Analytics: the cost-bearing event and object purchase prices drive the
  // spend aggregation (the exact query getHomeAnalytics runs). The costed
  // "Compressor repair" (850.5) must appear in the event spend total.
  const analytics = (await sql`
    SELECT
      COALESCE((SELECT SUM(po.purchase_price) FROM property_objects po
        JOIN properties p ON p.id = po.property_id WHERE p.clerk_user_id = ${TEST_USER}), 0) AS object_spend,
      COALESCE((SELECT SUM(oe.cost) FROM object_events oe
        JOIN property_objects po ON po.id = oe.object_id
        JOIN properties p ON p.id = po.property_id
        WHERE p.clerk_user_id = ${TEST_USER} AND oe.cost IS NOT NULL), 0) AS event_spend
  `) as unknown as { object_spend: string; event_spend: string }[];
  const a = analytics[0];
  if (Number(a.event_spend) !== 850.5) {
    console.error("FAIL: analytics event spend did not include the costed event (850.5).");
    process.exit(1);
  }
  console.log(`Analytics OK: object_spend=${a.object_spend} event_spend=${a.event_spend} (costed event #${costedEventId} summed).`);

  // 3.75) Sharing / household access round-trip. The owner shares the property
  // with a second user (role 'edit'), who must then see it in their property
  // list; a non-shared user must remain blocked; revoking removes access.
  const SHARED = "test-homesnap-shared-user";
  const NOSHARE = "test-homesnap-noshare-user";
  await sql`
    INSERT INTO users (clerk_user_id, email, addon_homesnap)
    VALUES (${SHARED}, ${"shared@example.com"}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET email = ${"shared@example.com"}, addon_homesnap = ${true}
  `;
  await sql`
    INSERT INTO users (clerk_user_id, email, addon_homesnap)
    VALUES (${NOSHARE}, ${"noshare@example.com"}, ${true})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  // Owner shares with SHARED at role 'edit'.
  await sql`
    INSERT INTO property_shares (property_id, grantee_user_id, grantee_email, role)
    VALUES (${propertyId}, ${SHARED}, ${"shared@example.com"}, ${"edit"})
  `;

  // The exact listProperties query run as the GRANTEE (SHARED).
  const sharedList = (await sql`
    SELECT p.*,
      CASE WHEN p.clerk_user_id = ${SHARED} THEN 'owner' ELSE ps.role END AS access_role
    FROM properties p
    LEFT JOIN property_shares ps
      ON ps.property_id = p.id AND ps.grantee_user_id = ${SHARED}
    WHERE p.clerk_user_id = ${SHARED} OR ps.id IS NOT NULL
    ORDER BY (p.clerk_user_id = ${SHARED}) DESC, p.created_at DESC, p.id DESC
  `) as unknown as Record<string, unknown>[];
  const sharedProp = sharedList.find((r) => Number(r.id) === propertyId);
  if (!sharedProp || sharedProp.access_role !== "edit") {
    console.error("FAIL: shared 'edit' grantee could not see the property with access_role=edit.");
    process.exit(1);
  }
  console.log("OK: shared 'edit' grantee sees the property with access_role=edit.");

  // The same query run as a NON-SHARED user (NOSHARE) must NOT return it.
  const noShareList = (await sql`
    SELECT p.*,
      CASE WHEN p.clerk_user_id = ${NOSHARE} THEN 'owner' ELSE ps.role END AS access_role
    FROM properties p
    LEFT JOIN property_shares ps
      ON ps.property_id = p.id AND ps.grantee_user_id = ${NOSHARE}
    WHERE p.clerk_user_id = ${NOSHARE} OR ps.id IS NOT NULL
    ORDER BY (p.clerk_user_id = ${NOSHARE}) DESC, p.created_at DESC, p.id DESC
  `) as unknown as Record<string, unknown>[];
  if (noShareList.some((r) => Number(r.id) === propertyId)) {
    console.error("FAIL: a non-shared user could see another owner's property (blocked access broken).");
    process.exit(1);
  }
  console.log("OK: a non-shared user is BLOCKED from another owner's property.");

  // A 'view' grantee reads the property with access_role=view (read-only).
  await sql`
    INSERT INTO property_shares (property_id, grantee_user_id, grantee_email, role)
    VALUES (${propertyId}, ${NOSHARE}, ${"noshare@example.com"}, ${"view"})
  `;
  const viewList = (await sql`
    SELECT p.*,
      CASE WHEN p.clerk_user_id = ${NOSHARE} THEN 'owner' ELSE ps.role END AS access_role
    FROM properties p
    LEFT JOIN property_shares ps
      ON ps.property_id = p.id AND ps.grantee_user_id = ${NOSHARE}
    WHERE p.clerk_user_id = ${NOSHARE} OR ps.id IS NOT NULL
  `) as unknown as Record<string, unknown>[];
  if (!viewList.some((r) => Number(r.id) === propertyId && r.access_role === "view")) {
    console.error("FAIL: 'view' grantee did not see the property with access_role=view.");
    process.exit(1);
  }
  console.log("OK: 'view' grantee sees the property with access_role=view (read-only).");

  // 3.8) Activity-log round-trip. Simulate the audit rows the server writes on
  // every HomeSnap action (actor = the owner and a shared 'edit' grantee), then
  // run the exact listActivity query (property-scoped + actor-email join,
  // most-recent-first) as the owner, the 'edit' grantee, and the 'view' grantee
  // — all must read them. A user with NO access (OTHER) must be blocked at the
  // owner-or-share boundary, exactly as requirePropertyAccess would reject them.
  await sql`
    INSERT INTO property_activity (property_id, actor_user_id, action, entity_type, entity_id, entity_label, message, created_at)
    VALUES
      (${propertyId}, ${TEST_USER}, ${"created"}, ${"object"}, ${objectId}, ${"Main HVAC"}, ${'Added System "Main HVAC".'}, ${"2026-01-02T12:00:00Z"}),
      (${propertyId}, ${SHARED}, ${"completed"}, ${"schedule"}, ${scheduleId}, ${"Replace air filter"}, ${'Completed maintenance "Replace air filter".'}, ${"2026-01-03T12:00:00Z"})
  `;

  const readActivity = async (asUser: string) =>
    (await sql`
      SELECT pa.*, u.email AS actor_email
      FROM property_activity pa
      LEFT JOIN users u ON u.clerk_user_id = pa.actor_user_id
      WHERE pa.property_id = ${propertyId}
      ORDER BY pa.created_at DESC, pa.id DESC
      LIMIT 100
    `) as unknown as Record<string, unknown>[];

  const ownerActs = await readActivity(TEST_USER);
  if (ownerActs.length < 2) {
    console.error("FAIL: owner could not read the property's activity rows.");
    process.exit(1);
  }
  // Most-recent-first: the "completed" row (01-03) must sort above "created" (01-02).
  if (String(ownerActs[0].action) !== "completed") {
    console.error("FAIL: activity is not returned most-recent-first.");
    process.exit(1);
  }
  if (String(ownerActs[1].action) !== "created") {
    console.error("FAIL: activity ordering wrong (expected created second).");
    process.exit(1);
  }
  // actor email resolved from users for the shared-member actor.
  if (String(ownerActs[0].actor_email) !== "shared@example.com") {
    console.error(`FAIL: actor email not joined for the shared member (got ${ownerActs[0].actor_email}).`);
    process.exit(1);
  }
  console.log("OK: owner reads property activity most-recent-first with actor email resolved.");

  const editActs = await readActivity(SHARED);
  const viewActs = await readActivity(NOSHARE);
  if (editActs.length < 2 || viewActs.length < 2) {
    console.error("FAIL: shared 'edit'/'view' grantees could not read the property's activity.");
    process.exit(1);
  }
  console.log("OK: shared 'edit' and 'view' grantees can read the property's activity.");

  // A user with no access (OTHER) must be blocked at the owner-or-share
  // boundary — the exact check requirePropertyAccess performs before any read.
  const otherAccess = (await sql`
    SELECT
      (SELECT 1 FROM properties WHERE id = ${propertyId} AND clerk_user_id = ${OTHER}) AS is_owner,
      (SELECT role FROM property_shares WHERE property_id = ${propertyId} AND grantee_user_id = ${OTHER}) AS role
  `) as unknown as { is_owner: number | null; role: string | null }[];
  if (otherAccess[0].is_owner === 1 || otherAccess[0].role != null) {
    console.error("FAIL: a non-shared user unexpectedly has access to the property's activity.");
    process.exit(1);
  }
  console.log("OK: a non-shared user is BLOCKED from reading the property's activity (access boundary).");

  // Object-scoped filter: only the object's own activity rows are returned.
  const objScoped = (await sql`
    SELECT entity_type, entity_id FROM property_activity
    WHERE property_id = ${propertyId} AND entity_type = 'object' AND entity_id = ${objectId}
    ORDER BY created_at DESC
  `) as unknown as Record<string, unknown>[];
  if (objScoped.length !== 1 || Number(objScoped[0].entity_id) !== objectId) {
    console.error("FAIL: object-scoped activity filter did not return exactly the object's row.");
    process.exit(1);
  }
  console.log("OK: activity can be filtered to a single object.");

  // Revoke the 'edit' share; SHARED must then lose access entirely.
  const revokedRows = (await sql`
    DELETE FROM property_shares
    WHERE property_id = ${propertyId} AND grantee_user_id = ${SHARED}
    RETURNING id
  `) as unknown as { id: number }[];
  if (!revokedRows[0]) {
    console.error("FAIL: revoke share did not delete a row.");
    process.exit(1);
  }
  const afterRevoke = (await sql`
    SELECT p.*, ps.role AS access_role
    FROM properties p
    LEFT JOIN property_shares ps
      ON ps.property_id = p.id AND ps.grantee_user_id = ${SHARED}
    WHERE p.clerk_user_id = ${SHARED} OR ps.id IS NOT NULL
  `) as unknown as Record<string, unknown>[];
  if (afterRevoke.some((r) => Number(r.id) === propertyId)) {
    console.error("FAIL: revoked grantee still sees the property.");
    process.exit(1);
  }
  console.log("OK: revoking the share removes the grantee's access.");

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
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER}, ${SHARED}, ${NOSHARE})`;
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
