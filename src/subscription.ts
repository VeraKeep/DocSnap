/**
 * Subscription helpers — query and mutate user subscription state in Neon.
 */

import { createServerFn } from "@tanstack/react-start";
import { sql } from "./db";
import { getVerifiedUserId } from "./serverAuth";
import { reconcilePendingEntitlements } from "./entitlements";

export type Tier = "free" | "personal" | "family";

export interface SubscriptionInfo {
  tier: Tier;
  /** Derived convenience flag retained for existing feature gates. */
  isPro: boolean;
  expiresAt: string | null;
}

function normalizeTier(status: string | null | undefined): Tier {
  // The current paid tiers are "personal" and "family". Legacy paid values from
  // the DB map forward so no existing subscriber loses paid access:
  //   "pro" → personal, "personal" → personal (unchanged),
  //   "household" → family, "complete" → family (dropped tiers fold up),
  //   "family" → family (current tier — the Family DocSnap / Family All Access
  //   value written by setSubscriptionTier; previously fell through to "free").
  if (status === "family" || status === "household" || status === "complete") {
    return "family";
  }
  if (status === "personal" || status === "pro") return "personal";
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

  // The user is now identifiable by their email. Grant any Stripe purchases
  // they made ANONYMOUSLY with this email before signing in (the "paid but not
  // granted" bug): each pending checkout is applied now. Only ever reconciles
  // what was actually PAID for — never invents a grant.
  if (email) {
    const settled = await reconcilePendingEntitlements(email, clerkUserId);
    if (settled > 0) {
      console.log(
        `[subscription] Reconciled ${settled} pending entitlement(s) for ${email} onto user ${clerkUserId}`,
      );
    }
  }
}

/** Set a paid subscription tier after a successful Stripe checkout.
 *  UPSERT (matches the add-on setters): a tier grant lands even if the `users`
 *  row doesn't exist yet (e.g. granting via client_reference_id before the
 *  first sign-in sync), rather than silently no-op'ing on a missing row. */
export async function setSubscriptionTier(
  clerkUserId: string, tier: Exclude<Tier, "free">, stripeCustomerId: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, subscription_status, stripe_customer_id)
      VALUES (${clerkUserId}, ${tier}, ${stripeCustomerId})
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        subscription_status = ${tier},
        stripe_customer_id = COALESCE(${stripeCustomerId}, users.stripe_customer_id),
        updated_at = NOW()
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

/**
 * HomeSnap add-on entitlement.
 *
 * HomeSnap is a PAID ADD-ON sold on the DocSnap side (owner decision,
 * business-plan rev 2): $3.99/mo or $39.99/yr. It is NOT bundled into any
 * DocSnap tier: a paid subscriber does NOT automatically get HomeSnap. Access
 * to /homesnap is a hard entitlement gate that unlocks ONLY when the user's
 * record has the add-on flag (addon_homesnap) set.
 */
/** Single source of truth for whether a user owns the HomeSnap add-on.
 *  FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 *  resolve to `false` (locked). Only an explicit `addon_homesnap = true`
 *  grants access. A paid DocSnap tier does NOT unlock HomeSnap. */
export async function hasHomeSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_homesnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_homesnap?: unknown } | undefined;
    return row?.addon_homesnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read HomeSnap add-on:", err);
    return false;
  }
}
/** Grant or revoke the HomeSnap add-on entitlement (webhook/admin use). */
export async function setHomeSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_homesnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_homesnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set HomeSnap add-on:", err); }
}
/**
 * BillSnap add-on entitlement.
 *
 * BillSnap is a PAID ADD-ON sold on the DocSnap side (owner decision,
 * business-plan rev 4, 2026-08-21): $2.99/month or $29.99/year recurring. It is
 * NOT bundled into any DocSnap tier — a Personal/Household/Complete subscriber
 * does NOT automatically get BillSnap. Access to /bills is a hard entitlement
 * gate that unlocks ONLY when the user's record has the add-on flag
 * (`users.addon_billsnap`) set. Fails closed: a missing users row, a NULL/false
 * flag, or any DB error all resolve to `false` (locked).
 */
/** Single source of truth for whether a user owns the BillSnap add-on.
 *  FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 *  resolve to `false` (locked). Only an explicit `addon_billsnap = true`
 *  grants access. A paid DocSnap tier does NOT unlock BillSnap. */
export async function hasBillSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_billsnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_billsnap?: unknown } | undefined;
    return row?.addon_billsnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read BillSnap add-on:", err);
    return false;
  }
}
/** Grant or revoke the BillSnap add-on entitlement (webhook/admin use). */
export async function setBillSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_billsnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_billsnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set BillSnap add-on:", err); }
}

/**
 * ContractSnap add-on entitlement.
 *
 * ContractSnap is a PAID ADD-ON sold on the DocSnap side (owner decision,
 * business-plan rev 3): $4.99/mo or $49.99/yr. It is NOT bundled into any
 * DocSnap tier: a paid subscriber does NOT automatically get ContractSnap.
 * Access to /contracts is a hard entitlement gate that unlocks ONLY when the
 * user's record has the add-on flag (addon_contractsnap) set.
 */
/** Single source of truth for whether a user owns the ContractSnap add-on.
 *  FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 *  resolve to `false` (locked). Only an explicit `addon_contractsnap = true`
 *  grants access. A paid DocSnap tier does NOT unlock ContractSnap. */
export async function hasContractSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_contractsnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_contractsnap?: unknown } | undefined;
    return row?.addon_contractsnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read ContractSnap add-on:", err);
    return false;
  }
}
/** Grant or revoke the ContractSnap add-on entitlement (webhook/admin use). */
export async function setContractSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_contractsnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_contractsnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set ContractSnap add-on:", err); }
}
/**
 * BookSnap add-on entitlement.
 *
 * BookSnap is a PAID ADD-ON sold on the DocSnap side ($3.99/mo or $39.99/yr).
 * It is NOT bundled into any DocSnap tier: a paid subscriber does NOT
 * automatically get BookSnap. Access is gated by the add-on flag
 * (`users.addon_booksnap`), mirroring the other module add-on flags.
 */
/** Single source of truth for whether a user owns the BookSnap add-on.
 *  FAILS CLOSED: a missing users row, a NULL/false flag, or any DB error all
 *  resolve to `false` (locked). Only an explicit `addon_booksnap = true`
 *  grants access. */
export async function hasBookSnapAddon(clerkUserId: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT addon_booksnap FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const row = rows[0] as { addon_booksnap?: unknown } | undefined;
    return row?.addon_booksnap === true;
  } catch (err) {
    console.error("[subscription] Failed to read BookSnap add-on:", err);
    return false;
  }
}
/** Grant or revoke the BookSnap add-on entitlement (webhook/admin use). */
export async function setBookSnapAddon(clerkUserId: string, owned: boolean): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, addon_booksnap)
      VALUES (${clerkUserId}, ${owned})
      ON CONFLICT (clerk_user_id) DO UPDATE SET addon_booksnap = ${owned}, updated_at = NOW()
    `;
  } catch (err) { console.error("[subscription] Failed to set BookSnap add-on:", err); }
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
