/**
 * Subscription helpers — query and mutate user subscription state in Neon.
 */

import { createServerFn } from "@tanstack/react-start";
import { sql } from "./db";
import { getVerifiedUserId } from "./serverAuth";

export type Tier = "free" | "personal" | "family";

export interface SubscriptionInfo {
  tier: Tier;
  /** Derived convenience flag retained for existing feature gates. */
  isPro: boolean;
  expiresAt: string | null;
}

function normalizeTier(status: string | null | undefined): Tier {
  // Legacy paid values from the DB map forward so no existing subscriber
  // loses paid access:
  //   "pro" → personal, "personal" → personal (unchanged),
  //   "household" → family, "complete" → family (dropped tiers fold up).
  if (status === "pro" || status === "personal") return "personal";
  if (status === "household" || status === "complete") return "family";
  return "free";
}

function info(tier: Tier, expiresAt: string | null): SubscriptionInfo {
  return { tier, isPro: tier !== "free", expiresAt };
}

export async function getUserSubscription(clerkUserId: string): Promise<SubscriptionInfo> {
  try {
    const rows = await sql`
      SELECT subscription_status, subscription_expires_at FROM users
      WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { subscription_status: string; subscription_expires_at: string | null } | undefined;
    if (!row) return info("free", null);
    return info(normalizeTier(row.subscription_status), row.subscription_expires_at ?? null);
  } catch (err) {
    console.error("[subscription] Failed to fetch subscription:", err);
    return info("free", null);
  }
}

export async function upsertUser(clerkUserId: string, email: string): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, email) VALUES (${clerkUserId}, ${email})
      ON CONFLICT (clerk_user_id) DO UPDATE SET email = ${email}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to upsert user:", err); }
}

/** Set a paid subscription tier after a successful Stripe checkout. */
export async function setSubscriptionTier(
  clerkUserId: string, tier: Exclude<Tier, "free">, stripeCustomerId: string,
): Promise<void> {
  try {
    await sql`
      UPDATE users SET subscription_status = ${tier}, stripe_customer_id = ${stripeCustomerId}, updated_at = NOW()
      WHERE clerk_user_id = ${clerkUserId}
    `;
  } catch (err) { console.error("[subscription] Failed to set subscription tier:", err); }
}

export async function setFreeSubscription(clerkUserId: string): Promise<void> {
  try {
    await sql`UPDATE users SET subscription_status = 'free', updated_at = NOW() WHERE clerk_user_id = ${clerkUserId}`;
  } catch (err) { console.error("[subscription] Failed to set free subscription:", err); }
}

export async function findUserByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT clerk_user_id FROM users WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1`;
    return (rows[0] as { clerk_user_id: string } | undefined)?.clerk_user_id ?? null;
  } catch (err) { console.error("[subscription] Failed to find user by stripe ID:", err); return null; }
}

export async function findUserByEmail(email: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT clerk_user_id FROM users WHERE email = ${email} LIMIT 1`;
    return (rows[0] as { clerk_user_id: string } | undefined)?.clerk_user_id ?? null;
  } catch (err) { console.error("[subscription] Failed to find user by email:", err); return null; }
}

/**
 * ReceiptSnap add-on entitlement.
 *
 * ReceiptSnap is a PAID ADD-ON sold on the DocSnap side (owner decision,
 * business-plan rev 15, 2026-08-21). It is NOT bundled into any DocSnap tier:
 * a Personal/Household/Complete subscriber does NOT automatically get
 * ReceiptSnap. Access to /receipts is a hard entitlement gate that unlocks
 * ONLY when the user's record has the add-on flag (addon_receiptsnap) set.
 *
 * The add-on product/price id that the Stripe webhook matches against is the
 * owner's DocSnap-side Stripe product — it hasn't been created yet, so it is a
 * clearly-marked config placeholder read from env with an empty default. Until
 * the owner provides `RECEIPTSNAP_ADDON_PRODUCT_ID`, the webhook treats it as
 * unconfigured and no-ops (see src/routes/api/-stripe-webhook.ts). This is an
 * expected, non-blocking gap.
 */
export const RECEIPTSNAP_ADDON_PRODUCT_ID = process.env.RECEIPTSNAP_ADDON_PRODUCT_ID ?? "";

/**
 * Single source of truth for whether a user owns the ReceiptSnap add-on.
 * FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 * resolve to `false` (locked). Only an explicit `addon_receiptsnap = true`
 * grants access. isPro/paid tier does NOT unlock ReceiptSnap.
 */
export async function hasReceiptSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_receiptsnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_receiptsnap?: unknown } | undefined;
    return row?.addon_receiptsnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read ReceiptSnap add-on:", err);
    return false;
  }
}

/** Grant or revoke the ReceiptSnap add-on entitlement (admin/webhook use). */
export async function setReceiptSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_receiptsnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_receiptsnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set ReceiptSnap add-on:", err); }
}

/**
 * GarageSnap add-on entitlement.
 *
 * GarageSnap is a PAID ADD-ON sold on the DocSnap side (owner decision,
 * business-plan rev 16). It is NOT bundled into any DocSnap tier: a paid
 * subscriber does NOT automatically get GarageSnap. Access to /garage is a
 * hard entitlement gate that unlocks ONLY when the user's record has the
 * add-on flag (addon_garagesnap) set.
 */
/** Single source of truth for whether a user owns the GarageSnap add-on.
 *  FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 *  resolve to `false` (locked). Only an explicit `addon_garagesnap = true`
 *  grants access. A paid DocSnap tier does NOT unlock GarageSnap. */
export async function hasGarageSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_garagesnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_garagesnap?: unknown } | undefined;
    return row?.addon_garagesnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read GarageSnap add-on:", err);
    return false;
  }
}
/** Grant or revoke the GarageSnap add-on entitlement (webhook/admin use). */
export async function setGarageSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_garagesnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_garagesnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set GarageSnap add-on:", err); }
}

/** MeetingSnap's independent 4-tier model (mirrors features/meetingsnap). */
export type MeetingTier = "free" | "personal" | "pro" | "team";
/** Grant/revoke the MEETING_SNAP independent subscription tier (webhook use).
 *  This is intentionally SEPARATE from DocSnap's subscription_status column —
 *  it writes the parallel `meeting_subscription_status` column. Fails closed:
 *  any DB error is logged and the tier is left unchanged. */
export async function setMeetingSubscriptionTier(
  clerkUserId: string,
  tier: MeetingTier,
): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, meeting_subscription_status)
      VALUES (${clerkUserId}, ${tier})
      ON CONFLICT (clerk_user_id) DO UPDATE SET meeting_subscription_status = ${tier}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set MeetingSnap tier:", err); }
}

/** GarageSnap entitlement for the signed-in user — the /garage UI gate
 *  channel (reports state rather than throwing; the caller renders the
 *  locked/upgrade screen). `hasAddon` is true only when the user owns the
 *  add-on. Anonymous → 401 (fail closed). */
export const getGarageEntitlement = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; hasAddon: boolean }> => {
  const userId = await getVerifiedUserId();
  if (!userId) throw new Error("Not signed in");
  if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false };
  const hasAddon = await hasGarageSnapAddon(userId);
  return { configured: true, hasAddon };
});

/** Fetch the signed-in user's subscription.
 *  The client-passed clerkUserId validator arg is ignored — the acting
 *  identity always comes from the verified Clerk session. */
export const getSubscription = createServerFn().validator((clerkUserId: string) => clerkUserId)
  .handler(async () => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    return getUserSubscription(userId);
  });
export const getPortalUrl = createServerFn().handler(async () => process.env.STRIPE_CUSTOMER_PORTAL_URL || null);
/** Sync the signed-in user's record. The client-passed clerkUserId is ignored
 *  in favor of the verified session; `email` is still taken from the caller
 *  (the user's own Clerk profile email, used only to link Stripe checkout
 *  emails to the user record — low risk, and only ever upserts the row keyed
 *  by the VERIFIED user id). */
export const syncUser = createServerFn().validator((params: { clerkUserId: string; email: string }) => params)
  .handler(async ({ data }) => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    await upsertUser(userId, data.email);
    return { ok: true };
  });
