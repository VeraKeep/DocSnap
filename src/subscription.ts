/**
 * Subscription helpers — query and mutate user subscription state in Neon.
 */

import { createServerFn } from "@tanstack/react-start";
import { sql } from "./db";
import { getVerifiedUserId } from "./serverAuth";

export type Tier = "free" | "personal" | "household" | "complete";

export interface SubscriptionInfo {
  tier: Tier;
  /** Derived convenience flag retained for existing feature gates. */
  isPro: boolean;
  expiresAt: string | null;
}

function normalizeTier(status: string | null | undefined): Tier {
  // Existing Pro subscribers retain their paid access as Personal.
  if (status === "pro") return "personal";
  if (status === "personal" || status === "household" || status === "complete") return status;
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
