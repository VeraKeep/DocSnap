/**
 * Subscription helpers — query and mutate user subscription state in Neon.
 */

import { createServerFn } from "@tanstack/react-start";
import { sql } from "./db";

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

export const getSubscription = createServerFn().validator((clerkUserId: string) => clerkUserId)
  .handler(async ({ data }) => getUserSubscription(data));
export const getPortalUrl = createServerFn().handler(async () => process.env.STRIPE_CUSTOMER_PORTAL_URL || null);
export const syncUser = createServerFn().validator((params: { clerkUserId: string; email: string }) => params)
  .handler(async ({ data }) => { await upsertUser(data.clerkUserId, data.email); return { ok: true }; });
