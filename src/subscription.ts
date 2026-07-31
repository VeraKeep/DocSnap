/**
 * Subscription helpers — query and mutate user subscription state in Neon.
 *
 * Raw functions (imported server-side) use the `sql` helper directly.
 * Server functions (createServerFn wrappers) are safe for client code
 * to import — TanStack Start strips the server-only body from the client
 * bundle and replaces it with an RPC call.
 *
 * All functions are safe to call even when DATABASE_URL is not set:
 * they return sensible defaults (free tier) and don't crash.
 */

import { createServerFn } from "@tanstack/react-start";
import { sql } from "./db";

export interface SubscriptionInfo {
  isPro: boolean;
  expiresAt: string | null;
}

/**
 * Get the subscription status for a given Clerk user.
 * Returns free-tier defaults when the user doesn't exist or the database
 * is unavailable.
 */
export async function getUserSubscription(
  clerkUserId: string,
): Promise<SubscriptionInfo> {
  try {
    const rows = await sql`
      SELECT subscription_status, subscription_expires_at
      FROM users
      WHERE clerk_user_id = ${clerkUserId}
      LIMIT 1
    `;
    const row = rows[0] as
      | { subscription_status: string; subscription_expires_at: string | null }
      | undefined;

    if (!row) return { isPro: false, expiresAt: null };

    return {
      isPro: row.subscription_status === "pro",
      expiresAt: row.subscription_expires_at ?? null,
    };
  } catch (err) {
    console.error("[subscription] Failed to fetch subscription:", err);
    return { isPro: false, expiresAt: null };
  }
}

/**
 * Create or update a user record. Called on sign-in so the webhook
 * can later look up the user by email.
 */
export async function upsertUser(
  clerkUserId: string,
  email: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO users (clerk_user_id, email)
      VALUES (${clerkUserId}, ${email})
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET email = ${email}, updated_at = NOW()
    `;
  } catch (err) {
    console.error("[subscription] Failed to upsert user:", err);
  }
}

/**
 * Promote a user to Pro after a successful Stripe checkout.
 */
export async function setProSubscription(
  clerkUserId: string,
  stripeCustomerId: string,
): Promise<void> {
  try {
    await sql`
      UPDATE users
      SET subscription_status = 'pro',
          stripe_customer_id = ${stripeCustomerId},
          updated_at = NOW()
      WHERE clerk_user_id = ${clerkUserId}
    `;
  } catch (err) {
    console.error("[subscription] Failed to set pro subscription:", err);
  }
}

/**
 * Demote a user back to free (e.g. subscription cancelled / expired).
 */
export async function setFreeSubscription(
  clerkUserId: string,
): Promise<void> {
  try {
    await sql`
      UPDATE users
      SET subscription_status = 'free',
          updated_at = NOW()
      WHERE clerk_user_id = ${clerkUserId}
    `;
  } catch (err) {
    console.error("[subscription] Failed to set free subscription:", err);
  }
}

/**
 * Find a user by their Stripe customer ID. Used by the webhook handler
 * when Stripe only gives us the customer_id, not the clerk_user_id.
 */
export async function findUserByStripeCustomerId(
  stripeCustomerId: string,
): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT clerk_user_id FROM users
      WHERE stripe_customer_id = ${stripeCustomerId}
      LIMIT 1
    `;
    const row = rows[0] as { clerk_user_id: string } | undefined;
    return row?.clerk_user_id ?? null;
  } catch (err) {
    console.error("[subscription] Failed to find user by stripe ID:", err);
    return null;
  }
}

/**
 * Find a user by email. Used during checkout.session.completed when
 * Stripe gives us the customer_email.
 */
export async function findUserByEmail(
  email: string,
): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT clerk_user_id FROM users
      WHERE email = ${email}
      LIMIT 1
    `;
    const row = rows[0] as { clerk_user_id: string } | undefined;
    return row?.clerk_user_id ?? null;
  } catch (err) {
    console.error("[subscription] Failed to find user by email:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Server functions — safe to import from client code.
// TanStack Start strips the handler body from the client bundle and replaces
// it with an RPC call to the server.
// ---------------------------------------------------------------------------

/** Fetch subscription info for the signed-in user. */
export const getSubscription = createServerFn()
  .validator((clerkUserId: string) => clerkUserId)
  .handler(async ({ data: clerkUserId }) => {
    return getUserSubscription(clerkUserId);
  });

/** Create or update the user record (called on sign-in). */
export const syncUser = createServerFn()
  .validator(
    (params: { clerkUserId: string; email: string }) => params,
  )
  .handler(async ({ data }) => {
    await upsertUser(data.clerkUserId, data.email);
    return { ok: true };
  });
