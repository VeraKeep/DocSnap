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
  findUserByEmail,
  findUserByStripeCustomerId,
} from "../../subscription";
import {
  applyEntitlementToUser,
  enqueuePendingEntitlement,
  reconcilePendingEntitlements,
} from "../../entitlements";
// Revoke/cancel routing lives in the shared module so the cancellation
// verify script drives the same production code path.
import {
  revokeSubscriptionEntitlement,
} from "../../revokeEntitlement";

export { revokeSubscriptionEntitlement };

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
    const stripe = new Stripe("sk_unused", { apiVersion: "2025-06-30.basil" as any });
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
        // If status is no longer active (past_due, unpaid, canceled), revoke
        // the entitlement this subscription paid for (module or DocSnap tier).
        const sub = event.data.object as Stripe.Subscription;
        if (sub.status !== "active" && sub.status !== "trialing") {
          const clerkUserId = sub.metadata?.clerk_user_id;
          if (clerkUserId) {
            await revokeSubscriptionEntitlement(clerkUserId, sub);
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
 *
 * Identity is resolved in this priority order (most → least reliable):
 *   1. `client_reference_id` — the Clerk user id our Buy buttons stamp onto
 *      the payment link when the buyer is signed in. This ties the grant to
 *      EXACTLY the Clerk user who initiated checkout, even if they pay with a
 *      different billing email. This is the fix for the "paid-but-not-granted"
 *      bug in its signed-in form.
 *   2. The checkout email (legacy path) — the Clerk user whose `users` record
 *      holds that email, if any.
 * When neither resolves to a user (an anonymous buyer), the purchase is NOT
 * dropped: it is recorded in the pending-entitlement queue keyed by the buying
 * email, and granted automatically the moment that email completes sign-in
 * (reconciled from `upsertUser`). A paying customer is therefore never
 * silently un-granted.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerEmail = session.customer_details?.email ?? null;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const checkoutSessionId = session.id ?? null;

  // Payment links may provide price_id in metadata; otherwise read the first
  // line item from the session object (no Stripe API call needed).
  const priceId = session.metadata?.price_id ?? await getCheckoutPriceId(session);

  // ── 1. Resolve the Clerk user, preferring the explicit client_reference_id ──
  let clerkUserId: string | null = null;
  const clientRef = session.client_reference_id;
  if (clientRef && /^user_/.test(clientRef)) {
    // Our Buy buttons stamp this when the buyer is signed in. A light format
    // check (`user_…`, Clerk's id shape) keeps scripted junk from creating
    // orphan rows, while still granting on real, paid checkouts.
    clerkUserId = clientRef;
  } else if (customerEmail) {
    clerkUserId = await findUserByEmail(customerEmail);
  }

  // ── 2. Known user → grant immediately + settle any older anonymous buys ──
  if (clerkUserId) {
    const status = await applyEntitlementToUser(clerkUserId, priceId, stripeCustomerId ?? "");
    if (status === "unknown") {
      // FAIL CLOSED: unknown / unlisted price grants nothing, just logs.
      console.warn(
        `[stripe-webhook] Unknown price ${priceId ?? "(none)"} — no entitlement granted (user ${clerkUserId})`,
      );
    }

    // Also grant any earlier ANONYMOUS purchases made with this same email
    // (e.g. they paid for a module, then signed in and bought more).
    if (customerEmail) {
      const settled = await reconcilePendingEntitlements(customerEmail, clerkUserId);
      if (settled > 0) {
        console.log(
          `[stripe-webhook] Reconciled ${settled} pending purchase(s) for email ${customerEmail} onto user ${clerkUserId}`,
        );
      }
    }
    return;
  }

  // ── 3. Can't identify the user yet — hold the purchase, don't drop it ──
  if (customerEmail) {
    await enqueuePendingEntitlement({
      email: customerEmail,
      priceId,
      stripeCustomerId: stripeCustomerId ?? "",
      checkoutSessionId: checkoutSessionId ?? undefined,
    });
    console.warn(
      `[stripe-webhook] No Clerk user for email ${customerEmail} — recorded a pending entitlement (` +
        `${priceId ?? "unknown price"}). It will be granted automatically when a user signs in with this email.`,
    );
    return;
  }

  console.warn(
    "[stripe-webhook] Checkout with no identifiable buyer (no client_reference_id and no email) — nothing to grant or queue",
  );
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

  // Demote ONLY the entitlement this subscription paid for (DocSnap tier, a
  // module add-on flag, or the MeetingSnap tier).
  await revokeSubscriptionEntitlement(clerkUserId, subscription);
}

/** Read the first line item's price id off a Subscription object (or its
 *  default_price) for demotion routing. Returns undefined if absent. */
async function getCheckoutPriceId(session: Stripe.Checkout.Session): Promise<string | undefined> {
  const embedded = session.line_items?.data?.[0]?.price?.id;
  if (embedded) return embedded;
  if (!session.id || !process.env.STRIPE_SECRET_KEY) return undefined;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-06-30.basil" as any });
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
