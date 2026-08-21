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
