/**
 * Verify CANCELLATION / DOWNGRADE entitlement behavior against the live Neon DB.
 *
 * This is the money-and-trust flow: when a customer cancels or downgrades a
 * subscription/add-on, their ACCESS must change correctly (the right gate flips
 * locked / unlocked) WITHOUT destroying any of their saved data. This script
 * proves, end-to-end (minus Stripe signature verification), that:
 *
 *  A. A single module add-on cancels  → THAT module locks (fails closed), but
 *     OTHER modules + the DocSnap tier they also paid for are NOT touched.
 *  B. The DocSnap Personal/Family tier cancels → tier drops toward free, module
 *     add-ons they own are untouched, and their data rows are preserved.
 *  C. All Access cancels → DocSnap tier + ALL SEVEN modules revert at once,
 *     and every module's data rows are preserved (never deleted).
 *  D. MeetingSnap tier downgrades (Pro→Personal→Free) change the tier but never
 *     delete transcripts/records.
 *  E. Re-purchase after cancel restores access to the SAME data rows (by id),
 *     not re-created/empty records.
 *  F. While a module is locked, its retained data is still present and
 *     owner-scope readable (access is gated separately from data retention).
 *  G. Every cancel/downgrade path completes without an uncaught exception or a
 *     failed write (the revoke helpers never throw; flags flip as expected).
 *
 * It drives the REAL functions: applyEntitlementToUser for grants and the
 * webhook's production revoke routing (src/revokeEntitlement.ts) for
 * cancels/downgrades — so it exercises the exact price → entitlement → setter
 * routing the Stripe webhook uses, not a reimplementation. Uses throwaway test
 * users and cleans up after itself.
 *
 * ENGINEERING NOTE (bun gotcha, verified on 2026-08-31): bun has a transpile
 * edge case in this import graph where module- or function-scoped `const` string
 * values referenced from an async main() can surface as "X is not defined"
 * (a temporal-dead-zone artifact). It does NOT happen with `function`
 * declarations or with inline string literals. So every price id is written
 * INLINE at its call site and all helpers are `function` declarations — exactly
 * the structure of the existing, working scripts/verifyAllAccess.ts. Do not
 * "clean up" the price strings back into constants.
 *
 * Run:  bun scripts/verifyCancellationDowngrade.ts   (part of `npm run verify`)
 */
import { sql } from "../src/db";
import { neon } from "@neondatabase/serverless";
import { applyEntitlementToUser } from "../src/entitlements";
import { revokeSubscriptionEntitlement } from "../src/revokeEntitlement";
import {
  setMeetingSubscriptionTier,
  hasReceiptSnapAddon,
  hasGarageSnapAddon,
  hasBillSnapAddon,
  hasContractSnapAddon,
  hasHomeSnapAddon,
  hasBookSnapAddon,
  getUserSubscription,
} from "../src/subscription";

// Raw neon client for the few queries that must use a DYNAMIC table identifier.
// The src/db `sql` helper is tagged-template-only (cannot take a table name as
// a value/identifier). Table names below always come from the hardcoded
// SEED_TABLES whitelist, so interpolating them into a query string is safe.
const rawPq =
  typeof process.env.DATABASE_URL === "string"
    ? neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } })
    : null;

const CLEANUP = process.env.KEEP_TEST_ROWS !== "1";

/** A fake Stripe.Subscription carrying only the price id the webhook routes on. */
function fakeSub(priceId: string) {
  return { items: { data: [{ price: { id: priceId } }] } } as any;
}

const MODULES = [
  ["ReceiptSnap", hasReceiptSnapAddon],
  ["GarageSnap", hasGarageSnapAddon],
  ["BillSnap", hasBillSnapAddon],
  ["ContractSnap", hasContractSnapAddon],
  ["HomeSnap", hasHomeSnapAddon],
  ["BookSnap", hasBookSnapAddon],
] as const;

const SEED_TABLES = [
  ["receipts", "clerk_user_id"],
  ["meetings", "clerk_user_id"],
  ["bills", "clerk_user_id"],
  ["contracts", "clerk_user_id"],
  ["garage_items", "clerk_user_id"],
  ["properties", "clerk_user_id"],
  ["books", "clerk_user_id"],
  ["share_links", "owner_user_id"],
] as const;

let failures = 0;
let passed = 0;
function check(cond: boolean, label: string) {
  if (cond) {
    console.log(`  OK: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

async function meetingTier(userId: string): Promise<string> {
  const rows = (await sql`
    SELECT meeting_subscription_status FROM users WHERE clerk_user_id = ${userId} LIMIT 1
  `) as unknown as { meeting_subscription_status?: string }[];
  return rows[0]?.meeting_subscription_status ?? "free";
}

async function cleanup(userIds: string[]) {
  for (const u of userIds) {
    try {
      // Delete the user's module data + user row. NOTE: the data tables have NO
      // FK to users; we delete them explicitly here purely for cleanup. A real
      // cancel never touches these — that is exactly what scenarios B/C/D prove.
      // (Table + owner column come from the hardcoded SEED_TABLES whitelist, so
      // building the query string with them is safe; params use $1.)
      for (const [table, ownerCol] of SEED_TABLES) {
        await rawPq?.query(`DELETE FROM ${table} WHERE ${ownerCol} = $1`, [u]);
      }
      await rawPq?.query(`DELETE FROM users WHERE clerk_user_id = $1`, [u]);
    } catch {
      /* best-effort */
    }
  }
}

/** Insert one row into each module table for the owner. */
async function seedAllModuleData(userId: string, tag: string) {
  const ids: Record<string, number> = {};
  const rec = (await sql`
    INSERT INTO receipts (clerk_user_id, merchant, store_date, total, currency)
    VALUES (${userId}, ${`Receipt ${tag}`}, ${"2026-08-01"}, 12.5, ${"usd"}) RETURNING id
  `) as unknown as { id: number }[];
  ids.receipt = Number(rec[0].id);
  const mtg = (await sql`
    INSERT INTO meetings (clerk_user_id, title, source_text)
    VALUES (${userId}, ${`Sync ${tag}`}, ${`Notes for cancellation test ${tag}.`}) RETURNING id
  `) as unknown as { id: number }[];
  ids.meeting = Number(mtg[0].id);
  await sql`
    INSERT INTO meeting_extractions (meeting_id, extraction)
    VALUES (${ids.meeting}, ${JSON.stringify({ executive_summary: `s ${tag}` })}::jsonb)`;
  const bill = (await sql`
    INSERT INTO bills (clerk_user_id, vendor, amount_due, due_date, status)
    VALUES (${userId}, ${`Vendor ${tag}`}, 99.99, ${"2026-09-01"}, ${"Upcoming"}) RETURNING id
  `) as unknown as { id: number }[];
  ids.bill = Number(bill[0].id);
  const con = (await sql`
    INSERT INTO contracts (clerk_user_id, title, source_text)
    VALUES (${userId}, ${`Contract ${tag}`}, ${`Terms for ${tag}.`}) RETURNING id
  `) as unknown as { id: number }[];
  ids.contract = Number(con[0].id);
  const gw = (await sql`
    INSERT INTO garage_items (clerk_user_id, name, category)
    VALUES (${userId}, ${`Drill ${tag}`}, ${"power_tool"}) RETURNING id
  `) as unknown as { id: number }[];
  ids.garage_item = Number(gw[0].id);
  const prop = (await sql`
    INSERT INTO properties (clerk_user_id, nickname, property_type)
    VALUES (${userId}, ${`Home ${tag}`}, ${"house"}) RETURNING id
  `) as unknown as { id: number }[];
  ids.home_property = Number(prop[0].id);
  await sql`
    INSERT INTO property_objects (property_id, object_type, name)
    VALUES (${ids.home_property}, ${"system"}, ${`HVAC ${tag}`})`;
  const book = (await sql`
    INSERT INTO books (clerk_user_id, title, author)
    VALUES (${userId}, ${`Book ${tag}`}, ${"Author"}) RETURNING id
  `) as unknown as { id: number }[];
  ids.book = Number(book[0].id);
  const share = (await sql`
    INSERT INTO share_links (id, document_id, owner_user_id)
    VALUES (gen_random_uuid(), ${`doc_${tag}`}, ${userId}) RETURNING id
  `) as unknown as { id: number }[];
  ids.share_link = Number(share[0].id);
  return ids;
}

/** Count an owner's rows across every module table (the full data surface). */
async function counts(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [table, ownerCol] of SEED_TABLES) {
    const rows = await rawPq?.query(
      `SELECT COUNT(*)::int AS c FROM ${table} WHERE ${ownerCol} = $1`,
      [userId],
    ) as { c: number }[];
    out[table] = Number(rows?.[0]?.c ?? 0);
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }

  const stamp = Date.now();
  const used: string[] = [];
  function mk(tag: string) {
    const u = `verify-cd-${stamp}-${tag}`;
    used.push(u);
    return u;
  }

  // ════════════════════════════════════════════════════════════════════════
  // A. SINGLE MODULE CANCEL: locks THAT module only, keeps others + tier.
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario A — cancel ONE module add-on (ReceiptSnap):");
  {
    const u = mk("a");
    await applyEntitlementToUser(u, "price_1U6kboQf4SDuORrEFu9UcESF", "cus_a"); // DocSnap Personal M
    await applyEntitlementToUser(u, "price_1U6kfsQf4SDuORrEjRw4yNQN", "cus_a"); // ReceiptSnap M
    await applyEntitlementToUser(u, "price_1U6kjFQf4SDuORrEVVcQ82hO", "cus_a"); // GarageSnap M
    check(await hasReceiptSnapAddon(u), "before cancel: ReceiptSnap granted");
    check(await hasGarageSnapAddon(u), "before cancel: GarageSnap granted");
    check((await getUserSubscription(u)).tier === "personal", "before cancel: DocSnap tier = personal");

    await revokeSubscriptionEntitlement(u, fakeSub("price_1U6kfsQf4SDuORrEjRw4yNQN"));

    check(!(await hasReceiptSnapAddon(u)), "after cancel: ReceiptSnap LOCKED (fails closed)");
    check(await hasGarageSnapAddon(u), "after cancel: unrelated GarageSnap still granted (untouched)");
    check((await getUserSubscription(u)).tier === "personal", "after cancel: DocSnap tier still personal (untouched)");
  }

  // ════════════════════════════════════════════════════════════════════════
  // B. DOCSNAP TIER CANCEL: tier -> free, module add-ons + data preserved.
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario B — cancel the DocSnap Personal tier:");
  {
    const u = mk("b");
    await applyEntitlementToUser(u, "price_1U6kboQf4SDuORrEFu9UcESF", "cus_b");
    await applyEntitlementToUser(u, "price_1U6kfsQf4SDuORrEjRw4yNQN", "cus_b");
    await seedAllModuleData(u, "B");
    const countBefore = await counts(u);
    check((await getUserSubscription(u)).tier === "personal", "before cancel: tier = personal");
    check(await hasReceiptSnapAddon(u), "before cancel: ReceiptSnap granted");

    await revokeSubscriptionEntitlement(u, fakeSub("price_1U6kboQf4SDuORrEFu9UcESF"));

    check((await getUserSubscription(u)).tier === "free", "after cancel: DocSnap tier dropped to free");
    check(await hasReceiptSnapAddon(u), "after cancel: ReceiptSnap add-on preserved (tier cancel ≠ add-on revoke)");
    const countAfter = await counts(u);
    for (const t of SEED_TABLES.map((p) => p[0])) {
      check(countBefore[t] === 1 && countAfter[t] === 1,
        `data preserved: ${t} rows ${countBefore[t]} -> ${countAfter[t]}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // C. ALL ACCESS CANCEL: tier + all 7 modules revert; ALL data preserved.
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario C — cancel VeraKeep All Access (Family):");
  {
    const u = mk("c");
    const status = await applyEntitlementToUser(u, "price_1UA7fQQf4SDuORrEM1qRWnbE", "cus_c");
    check(status === "granted", "All Access checkout granted");
    check((await getUserSubscription(u)).tier === "family", "before cancel: DocSnap tier = family");
    for (const [name, has] of MODULES) check(await has(u), `before cancel: ${name} granted`);
    check((await meetingTier(u)) === "personal", "before cancel: MeetingSnap tier = personal");

    const ids = await seedAllModuleData(u, "C");
    const countBefore = await counts(u);
    check(Object.values(countBefore).every((c) => c >= 1), `seeded ${SEED_TABLES.length} data surfaces`);

    await revokeSubscriptionEntitlement(u, fakeSub("price_1UA7fQQf4SDuORrEM1qRWnbE"));

    check((await getUserSubscription(u)).tier === "free", "after cancel: DocSnap tier reverted to free");
    for (const [name, has] of MODULES) check(!(await has(u)), `after cancel: ${name} LOCKED (reverted)`);
    check((await meetingTier(u)) === "free", "after cancel: MeetingSnap reverted to free");

    const countAfter = await counts(u);
    for (const t of SEED_TABLES.map((p) => p[0])) {
      check(countBefore[t] === countAfter[t] && countAfter[t] >= 1,
        `data preserved after All Access cancel: ${t} ${countBefore[t]} -> ${countAfter[t]}`);
    }
    const idChecks: [string, number, string][] = [
      ["receipt", ids.receipt, "receipts"],
      ["meeting", ids.meeting, "meetings"],
      ["bill", ids.bill, "bills"],
      ["contract", ids.contract, "contracts"],
      ["garage_item", ids.garage_item, "garage_items"],
      ["home_property", ids.home_property, "properties"],
      ["book", ids.book, "books"],
    ];
    for (const [label, id, table] of idChecks) {
      const rows = await rawPq?.query(
        `SELECT COUNT(*)::int AS c FROM ${table} WHERE id = $1 AND clerk_user_id = $2`,
        [id, u],
      ) as { c: number }[];
      check(Number(rows?.[0]?.c ?? 0) === 1, `All Access cancel kept SAME row: ${label} id=${id}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // D. MEETING SNAP TIER DOWNGRADE: Pro -> Personal -> Free, data preserved.
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario D — MeetingSnap tier downgrade (Pro → Personal → Free):");
  {
    const u = mk("d");
    await setMeetingSubscriptionTier(u, "pro");
    await seedAllModuleData(u, "D");
    check((await meetingTier(u)) === "pro", "before: MeetingSnap tier = pro");

    await setMeetingSubscriptionTier(u, "personal");
    check((await meetingTier(u)) === "personal", "downgrade: tier now personal");
    const m1 = (await sql`
      SELECT COUNT(*)::int AS c FROM meetings WHERE clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(m1[0]?.c ?? 0) === 1, "downgrade Pro→Personal: transcript still present");
    const e1 = (await sql`
      SELECT COUNT(*)::int AS c FROM meeting_extractions me
      JOIN meetings m ON m.id = me.meeting_id WHERE m.clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(e1[0]?.c ?? 0) === 1, "downgrade Pro→Personal: extraction still present");

    await setMeetingSubscriptionTier(u, "free");
    check((await meetingTier(u)) === "free", "downgrade: tier now free");
    const m2 = (await sql`
      SELECT COUNT(*)::int AS c FROM meetings WHERE clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(m2[0]?.c ?? 0) === 1, "downgrade Personal→Free: transcript still present");
    const e2 = (await sql`
      SELECT COUNT(*)::int AS c FROM meeting_extractions me
      JOIN meetings m ON m.id = me.meeting_id WHERE m.clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(e2[0]?.c ?? 0) === 1, "downgrade Personal→Free: extraction still present");
  }

  // ════════════════════════════════════════════════════════════════════════
  // E. RE-PURCHASE RESTORES ACCESS TO THE SAME DATA (not re-created).
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario E — re-purchase after cancel restores access to SAME data:");
  {
    const u = mk("e");
    await applyEntitlementToUser(u, "price_1U6kfsQf4SDuORrEjRw4yNQN", "cus_e");
    const rec = (await sql`
      INSERT INTO receipts (clerk_user_id, merchant)
      VALUES (${u}, ${"Persistent Receipt"}) RETURNING id
    `) as unknown as { id: number }[];
    const receiptId = Number(rec[0].id);
    check(await hasReceiptSnapAddon(u), "before: ReceiptSnap granted, data created");

    await revokeSubscriptionEntitlement(u, fakeSub("price_1U6kfsQf4SDuORrEjRw4yNQN"));
    check(!(await hasReceiptSnapAddon(u)), "after cancel: ReceiptSnap locked");
    const stillThere = (await sql`
      SELECT COUNT(*)::int AS c FROM receipts WHERE id = ${receiptId} AND clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(stillThere[0]?.c ?? 0) === 1, "after cancel: original receipt row STILL in DB");

    await applyEntitlementToUser(u, "price_1U6kfsQf4SDuORrEjRw4yNQN", "cus_e2");
    check(await hasReceiptSnapAddon(u), "re-purchase: access restored (unlocked)");
    const sameRow = (await sql`
      SELECT COUNT(*)::int AS c FROM receipts WHERE id = ${receiptId} AND clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(sameRow[0]?.c ?? 0) === 1, "re-purchase: SAME receipt row id present — access restored to same data, not re-created");
    const total = (await sql`
      SELECT COUNT(*)::int AS c FROM receipts WHERE clerk_user_id = ${u}
    `) as unknown as { c: number }[];
    check(Number(total[0]?.c ?? 0) === 1, "re-purchase: exactly 1 receipt row (no duplicates)");
  }

  // ════════════════════════════════════════════════════════════════════════
  // F. LOCKED MODULE, DATA RETAINED + owner-scope readable (access ≠ deletion).
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario F — locked module still retains + allows owner reads of data:");
  {
    const u = mk("f");
    await applyEntitlementToUser(u, "price_1U6kjFQf4SDuORrEVVcQ82hO", "cus_f");
    const gw = (await sql`
      INSERT INTO garage_items (clerk_user_id, name)
      VALUES (${u}, ${"Retained Tool"}) RETURNING id
    `) as unknown as { id: number }[];
    const itemId = Number(gw[0].id);
    await revokeSubscriptionEntitlement(u, fakeSub("price_1U6kjFQf4SDuORrEVVcQ82hO"));
    check(!(await hasGarageSnapAddon(u)), "after cancel: GarageSnap locked");
    const readable = (await sql`
      SELECT name FROM garage_items WHERE id = ${itemId} AND clerk_user_id = ${u}
    `) as unknown as { name: string }[];
    check(readable.length === 1 && readable[0].name === "Retained Tool",
      "locked module: underlying row still present and owner-readable");
  }

  // ════════════════════════════════════════════════════════════════════════
  // G. Cancel/renew cycle runs clean (no crashes, no failed writes).
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nScenario G — cancel/renew cycle runs clean (no crashes, no failed writes):");
  {
    const u = mk("g");
    await applyEntitlementToUser(u, "price_1U6kjFQf4SDuORrEVVcQ82hO", "cus_g");
    for (let cycle = 1; cycle <= 3; cycle++) {
      await revokeSubscriptionEntitlement(u, fakeSub("price_1U6kjFQf4SDuORrEVVcQ82hO"));
      const locked = !(await hasGarageSnapAddon(u));
      await applyEntitlementToUser(u, "price_1U6kjFQf4SDuORrEVVcQ82hO", `cus_g_${cycle}`);
      const granted = await hasGarageSnapAddon(u);
      check(locked && granted, `cycle ${cycle}: cancel->locked then renew->granted (both setters resolved cleanly)`);
    }
  }

  if (CLEANUP) {
    await cleanup(used);
    console.log(`\nOK: cleaned up ${used.length} test user(s) (set KEEP_TEST_ROWS=1 to retain).`);
  } else {
    console.log("\nKEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }

  if (failures > 0) {
    console.error(`\nVerifyCancellationDowngrade FAILED — ${failures} check(s) failed (${passed} passed).`);
    process.exit(1);
  }
  console.log(`\nVerifyCancellationDowngrade OK — ${passed} checks passed. Cancel/downgrade changes access, never deletes data.`);
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
