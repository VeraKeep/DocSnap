/**
 * Verify the VeraKeep All Access bundle grants ALL SEVEN modules — and that
 * revoke mirrors it (all seven lost simultaneously) — against the live Neon DB,
 * through the SAME functions the Stripe webhook uses (applyEntitlementToUser)
 * and the same setters the webhook revoke path calls.
 *
 * Proves, end-to-end (minus Stripe signature verification):
 *   1. Every All Access price ID (individual + Family × monthly + yearly, old +
 *      new) maps to kind "allaccess" with the right bundle tier.
 *   2. One All Access checkout sets the DocSnap tier AND all seven module flags
 *      (ReceiptSnap, GarageSnap, BillSnap, ContractSnap, HomeSnap, BookSnap,
 *      MeetingSnap personal) — so NO separate per-module purchase is needed.
 *   3. Each module's entitlement gate (has*SnapAddon / meeting tier) sees the
 *      grant.
 *   4. Revoke (the exact setters the webhook calls for an ended All Access
 *      subscription) flips all seven flags false simultaneously.
 *   5. Contrast / fails-closed: a DocSnap-only tier (Personal) grants NONE of
 *      the seven modules — modules genuinely require their own purchase unless
 *      the user holds All Access.
 *
 * Uses throwaway test users, cleans up after itself. Never prints DATABASE_URL.
 * Run:  bun scripts/verifyAllAccess.ts
 */
import { sql } from "../src/db";
import {
  PRICE_ENTITLEMENTS,
  applyEntitlementToUser,
} from "../src/entitlements";
import {
  setFreeSubscription,
  setReceiptSnapAddon,
  setGarageSnapAddon,
  setBillSnapAddon,
  setContractSnapAddon,
  setHomeSnapAddon,
  setBookSnapAddon,
  setMeetingSubscriptionTier,
  hasReceiptSnapAddon,
  hasGarageSnapAddon,
  hasBillSnapAddon,
  hasContractSnapAddon,
  hasHomeSnapAddon,
  hasBookSnapAddon,
  getUserSubscription,
} from "../src/subscription";

const CLEANUP = process.env.KEEP_TEST_ROWS !== "1";

// All VeraKeep All Access price IDs (old pre-price-change + new). Each maps to
// kind "allaccess" with a bundle tier.
const ALL_ACCESS_PRICES: { priceId: string; tier: "personal" | "family" }[] = [
  // Old (pre-price-change), kept for existing subscribers
  { priceId: "price_1U6kqkQf4SDuORrEoLEI1tPk", tier: "personal" }, // Individual monthly ($11.99)
  { priceId: "price_1U6kufQf4SDuORrEWjOSH4cY", tier: "personal" }, // Individual annual ($119.99)
  { priceId: "price_1U6kw9Qf4SDuORrEjfbf8nV5", tier: "family" }, // Family monthly ($17.99)
  { priceId: "price_1U6kxKQf4SDuORrEhoVI8wqF", tier: "family" }, // Family annual ($179.99)
  // New (current pricing)
  { priceId: "price_1UA7bCQf4SDuORrEsqdCo2XT", tier: "personal" }, // Individual monthly ($19.99)
  { priceId: "price_1UA7byQf4SDuORrEDbEQ9chv", tier: "personal" }, // Individual yearly ($199.99)
  { priceId: "price_1UA7evQf4SDuORrEWSQToZT0", tier: "family" }, // Family monthly ($24.99)
  { priceId: "price_1UA7fQQf4SDuORrEM1qRWnbE", tier: "family" }, // Family yearly ($249.99)
];

const MODULES = [
  ["ReceiptSnap", hasReceiptSnapAddon],
  ["GarageSnap", hasGarageSnapAddon],
  ["BillSnap", hasBillSnapAddon],
  ["ContractSnap", hasContractSnapAddon],
  ["HomeSnap", hasHomeSnapAddon],
  ["BookSnap", hasBookSnapAddon],
] as const;

async function meetingTier(userId: string): Promise<string> {
  const rows = (await sql`
    SELECT meeting_subscription_status FROM users WHERE clerk_user_id = ${userId} LIMIT 1
  `) as unknown as { meeting_subscription_status?: string }[];
  return rows[0]?.meeting_subscription_status ?? "free";
}

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) {
    console.log(`  OK: ${label}`);
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

async function cleanup(userIds: string[]) {
  for (const u of userIds) {
    try {
      await sql`DELETE FROM users WHERE clerk_user_id = ${u}`;
    } catch {
      /* best-effort */
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }

  const used: string[] = [];
  const stamp = Date.now();

  // ── 0. Every All Access price maps to kind "allaccess" with a bundle tier ──
  console.log("Step 0 — PRICE_ENTITLEMENTS agrees these are All Access:");
  for (const { priceId, tier } of ALL_ACCESS_PRICES) {
    const e = PRICE_ENTITLEMENTS[priceId];
    check(e?.kind === "allaccess", `price ${priceId} -> allaccess`);
    check(e?.bundleTier === tier, `price ${priceId} bundle tier = ${tier}`);
  }

  // ── 1–4. Grant then revoke for each All Access price ID ──
  let userId = 0;
  for (const { priceId, tier } of ALL_ACCESS_PRICES) {
    userId++;
    const uid = `verify-allaccess-${stamp}-${userId}`;
    used.push(uid);

    // GRANT via the exact webhook grant path.
    const status = await applyEntitlementToUser(uid, priceId, `cus_test_${stamp}_${userId}`);
    check(status === "granted", `[${priceId}] grant returned "granted"`);

    // DocSnap tier + all seven modules granted & each gate sees it.
    const sub = await getUserSubscription(uid);
    check(sub.tier === tier, `[${priceId}] DocSnap tier = ${tier}`);
    for (const [name, has] of MODULES) {
      check(await has(uid), `[${priceId}] ${name} granted (gate sees it)`);
    }
    const mt = await meetingTier(uid);
    check(mt === "personal", `[${priceId}] MeetingSnap tier = personal (got ${mt})`);

    // NO separate per-module purchase needed is implied: all seven flags are
    // set by this single price. Nothing else to buy.

    // REVOKE — exactly the setters the webhook's revokeSubscriptionEntitlement
    // calls for kind === "allaccess".
    await setFreeSubscription(uid);
    await setReceiptSnapAddon(uid, false);
    await setGarageSnapAddon(uid, false);
    await setMeetingSubscriptionTier(uid, "free");
    await setHomeSnapAddon(uid, false);
    await setContractSnapAddon(uid, false);
    await setBillSnapAddon(uid, false);
    await setBookSnapAddon(uid, false);

    // All seven lost SIMULTANEOUSLY + DocSnap demoted.
    for (const [name, has] of MODULES) {
      check(!(await has(uid)), `[${priceId}] revoke turned OFF ${name}`);
    }
    const sub2 = await getUserSubscription(uid);
    check(sub2.tier === "free", `[${priceId}] revoke demoted DocSnap to free`);
    const mt2 = await meetingTier(uid);
    check(mt2 !== "personal", `[${priceId}] revoke reset MeetingSnap (got ${mt2})`);
  }

  // ── 5. Contrast / fails-closed: DocSnap Personal alone grants no module ──
  console.log("Step 5 — DocSnap-only (no All Access) grants NONE of the modules:");
  const uidP = `verify-allaccess-${stamp}-personal`;
  used.push(uidP);
  const pStatus = await applyEntitlementToUser(uidP, "price_1U6kboQf4SDuORrEFu9UcESF", `cus_test_${stamp}_p`);
  check(pStatus === "granted", "Personal checkout granted");
  for (const [name, has] of MODULES) {
    check(!(await has(uidP)), `Personal alone does NOT grant ${name} (separate purchase required)`);
  }
  check((await meetingTier(uidP)) === "free", "Personal alone does NOT grant MeetingSnap");

  if (CLEANUP) {
    await cleanup(used);
    console.log(`OK: cleaned up ${used.length} test user(s) (set KEEP_TEST_ROWS=1 to retain).`);
  }

  if (failures > 0) {
    console.error(`\nVerifyAllAccess FAILED — ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nVerifyAllAccess OK — All Access grants + revokes all seven modules.");
}

main().catch((err) => {
  console.error("VerifyAllAccess error:", err);
  process.exit(1);
});
