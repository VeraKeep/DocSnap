/**
 * Stripe webhook endpoint.
 *
 * Receives Stripe events, verifies the signature, and updates user
 * subscription state in the database.
 *
 * POST /api/stripe-webhook
 *
 * Required env vars:
 *   - STRIPE_WEBHOOK_SECRET: signing secret from Stripe dashboard
 *   - DATABASE_URL: Neon Postgres connection string
 */

import Stripe from "stripe";
import { sql } from "../../db";
import {
  setSubscriptionTier,
  setFreeSubscription,
  findUserByEmail,
  findUserByStripeCustomerId,
} from "../../subscription";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export async function POST(request: Request) {
  // If Stripe is not configured, return a clear 501.
  if (!webhookSecret) {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response(
      JSON.stringify({ error: "Stripe webhook not configured" }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to read request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const signature = request.headers.get("stripe-signature") ?? "";

  // Verify the event signature.
  let event: Stripe.Event;
  try {
    const stripe = new Stripe("sk_unused", { apiVersion: "2025-06-30.basil" });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Log the event to webhook_events table (best-effort).
  logEvent(event).catch((err) =>
    console.error("[stripe-webhook] Failed to log event:", err),
  );

  // Dispatch based on event type.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "customer.subscription.updated": {
        // If status is no longer active (past_due, unpaid, canceled), demote.
        const sub = event.data.object as Stripe.Subscription;
        if (sub.status !== "active" && sub.status !== "trialing") {
          const clerkUserId = sub.metadata?.clerk_user_id;
          if (clerkUserId) {
            await setFreeSubscription(clerkUserId);
          }
        }
        break;
      }

      default:
        // Ignore other events silently.
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] Error handling event:", err);
    // Still return 200 to Stripe so it doesn't retry indefinitely.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Handle checkout.session.completed — the user paid.
 * We look up the Clerk user by email (passed in the checkout session)
 * and promote them to Pro.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerEmail = session.customer_details?.email;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!customerEmail) {
    console.warn("[stripe-webhook] No customer email in checkout session");
    return;
  }

  const clerkUserId = await findUserByEmail(customerEmail);
  if (!clerkUserId) {
    console.warn(
      `[stripe-webhook] No Clerk user found for email: ${customerEmail}. ` +
        `User may not have signed in yet — the webhook will retry.`,
    );
    return;
  }

  // Payment links may provide price_id in metadata; otherwise retrieve line items.
  const priceId = session.metadata?.price_id ?? await getCheckoutPriceId(session);
  const tier = priceTier(priceId);
  await setSubscriptionTier(clerkUserId, tier, stripeCustomerId ?? "");
  console.log(`[stripe-webhook] Set ${tier} for user ${clerkUserId}`);
}

/**
 * Handle customer.subscription.deleted — subscription ended.
 * Look up the user by Stripe customer ID and demote to free.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!stripeCustomerId) {
    console.warn("[stripe-webhook] No customer ID on deleted subscription");
    return;
  }

  const clerkUserId = await findUserByStripeCustomerId(stripeCustomerId);
  if (!clerkUserId) {
    console.warn(
      `[stripe-webhook] No user found for Stripe customer: ${stripeCustomerId}`,
    );
    return;
  }

  await setFreeSubscription(clerkUserId);
  console.log(`[stripe-webhook] Set Free for user ${clerkUserId}`);
}

const PRICE_TIERS: Record<string, "personal" | "household" | "complete"> = {
  "price_1U2SjQDjQBNY25JvY49czw5w": "personal",
  "price_1U2SjQDjQBNY25JvHW3Jgxoi": "household",
  "price_1U2SjQDjQBNY25JvnOS572z2": "complete",
  "price_1TzAj6DjQBNY25Jv2G11crty": "personal",
  "price_1TzAj7DjQBNY25JvJ6F1YHOE": "personal",
};

function priceTier(priceId: string | undefined): "personal" | "household" | "complete" {
  return (priceId && PRICE_TIERS[priceId]) || "personal";
}

async function getCheckoutPriceId(session: Stripe.Checkout.Session): Promise<string | undefined> {
  const embedded = session.line_items?.data?.[0]?.price?.id;
  if (embedded) return embedded;
  if (!session.id || !process.env.STRIPE_SECRET_KEY) return undefined;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-06-30.basil" });
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    return items.data[0]?.price?.id;
  } catch (err) {
    console.error("[stripe-webhook] Failed to read checkout line items:", err);
    return undefined;
  }
}

/**
 * Log a webhook event to the database (best-effort, non-blocking).
 */
async function logEvent(event: Stripe.Event): Promise<void> {
  try {
    await sql`
      INSERT INTO webhook_events (stripe_event_id, event_type, payload)
      VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)})
      ON CONFLICT (stripe_event_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[stripe-webhook] Failed to log event:", err);
  }
}
