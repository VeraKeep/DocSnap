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
  setReceiptSnapAddon,
  setGarageSnapAddon,
  setMeetingSubscriptionTier,
  RECEIPTSNAP_ADDON_PRODUCT_ID,
} from "../../subscription";
import type { Tier } from "../../subscription";

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

  // Keep the legacy env-based ReceiptSnap add-on product fallback working: if
  // the checkout was for that product, grant the add-on and stop (don't touch
  // any DocSnap tier). When unset, this gracefully no-ops so normal checkouts
  // keep flowing through the entitlement map below.
  if (priceId && RECEIPTSNAP_ADDON_PRODUCT_ID && priceId === RECEIPTSNAP_ADDON_PRODUCT_ID) {
    await setReceiptSnapAddon(clerkUserId, true);
    console.log(`[stripe-webhook] Granted ReceiptSnap add-on for user ${clerkUserId}`);
    return;
  }

  // Route the checkout price to exactly the entitlement it purchased.
  const entitlement = priceId ? PRICE_ENTITLEMENTS[priceId] : undefined;
  if (!entitlement) {
    // FAIL CLOSED: unknown / unlisted price grants nothing, just logs.
    console.warn(
      `[stripe-webhook] Unknown price ${priceId ?? "(none)"} — no entitlement granted (user ${clerkUserId})`,
    );
    return;
  }

  switch (entitlement.kind) {
    case "docsnap": {
      const tier = priceTier(priceId);
      await setSubscriptionTier(clerkUserId, tier, stripeCustomerId ?? "");
      console.log(`[stripe-webhook] Set DocSnap ${tier} for user ${clerkUserId}`);
      break;
    }
    case "receiptsnap":
      await setReceiptSnapAddon(clerkUserId, true);
      console.log(`[stripe-webhook] Granted ReceiptSnap add-on for user ${clerkUserId}`);
      break;
    case "garagesnap":
      await setGarageSnapAddon(clerkUserId, true);
      console.log(`[stripe-webhook] Granted GarageSnap add-on for user ${clerkUserId}`);
      break;
    case "meetingsnap":
      await setMeetingSubscriptionTier(clerkUserId, entitlement.meetingTier ?? "free");
      console.log(
        `[stripe-webhook] Set MeetingSnap ${entitlement.meetingTier ?? "free"} for user ${clerkUserId}`,
      );
      break;
  }
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

/** The paid tiers a checkout price can grant: Personal or Family. */
type PaidTier = Exclude<Tier, "free">;
const PRICE_TIERS: Record<string, PaidTier> = {
  "price_1U2SjQDjQBNY25JvY49czw5w": "personal",
  "price_1U2SjQDjQBNY25JvHW3Jgxoi": "family", // legacy Household → Family
  "price_1U2SjQDjQBNY25JvnOS572z2": "family", // legacy Complete → Family
  "price_1TzAj6DjQBNY25Jv2G11crty": "personal",
  "price_1TzAj7DjQBNY25JvJ6F1YHOE": "personal",
  // ── NEW DocSnap prices (owner-provided Stripe price IDs) ──
  "price_1U6kboQf4SDuORrEFu9UcESF": "personal", // Personal monthly
  "price_1U6kdfQf4SDuORrEffdSCmFz": "personal", // Personal annual
  "price_1U6kcWQf4SDuORrEuBANqNn2": "family", // Family monthly
  "price_1U6keEQf4SDuORrE2lDWZkw5": "family", // Family annual
};

function priceTier(priceId: string | undefined): PaidTier {
  return (priceId && PRICE_TIERS[priceId]) || "personal";
}

/**
 * Entitlement routing — the single source of truth for what a checkout price
 * grants. Each price maps to a module `kind` (and, where relevant, a tier).
 * Everything here is ADDITIVE: unknown prices route to no entitlement (see
 * handleCheckoutCompleted) and are logged — they grant nothing.
 *
 * NOTE: The VeraKeep All Access bundle products and MeetingSnap's 'team' tier
 * are intentionally OUT OF SCOPE here (no UI/entitlement semantics yet) — no
 * slots for them.
 */
type EntitlementKind = "docsnap" | "receiptsnap" | "garagesnap" | "meetingsnap";
interface PriceEntitlement {
  kind: EntitlementKind;
  /** MeetingSnap tier when kind === 'meetingsnap' (else unused). */
  meetingTier?: string;
}
/** Every known module + DocSnap price → its entitlement. DocSnap tiers are
 *  resolved via priceTier() (PRICE_TIERS above, incl. legacy folds); the
 *  entry here only marks the price as a DocSnap checkout. */
const PRICE_ENTITLEMENTS: Record<string, PriceEntitlement> = {
  // DocSnap — Personal / Family (incl. legacy Household/Complete folds)
  "price_1U2SjQDjQBNY25JvY49czw5w": { kind: "docsnap" },
  "price_1U2SjQDjQBNY25JvHW3Jgxoi": { kind: "docsnap" },
  "price_1U2SjQDjQBNY25JvnOS572z2": { kind: "docsnap" },
  "price_1TzAj6DjQBNY25Jv2G11crty": { kind: "docsnap" },
  "price_1TzAj7DjQBNY25JvJ6F1YHOE": { kind: "docsnap" },
  "price_1U6kboQf4SDuORrEFu9UcESF": { kind: "docsnap" }, // Personal monthly
  "price_1U6kdfQf4SDuORrEffdSCmFz": { kind: "docsnap" }, // Personal annual
  "price_1U6kcWQf4SDuORrEuBANqNn2": { kind: "docsnap" }, // Family monthly
  "price_1U6keEQf4SDuORrE2lDWZkw5": { kind: "docsnap" }, // Family annual
  // ReceiptSnap add-on
  "price_1U6kfsQf4SDuORrEjRw4yNQN": { kind: "receiptsnap" }, // monthly
  "price_1U6khZQf4SDuORrE0ULOHWTT": { kind: "receiptsnap" }, // annual
  // GarageSnap add-on
  "price_1U6kjFQf4SDuORrEVVcQ82hO": { kind: "garagesnap" }, // monthly
  "price_1U6kjaQf4SDuORrEfYIEGIX1": { kind: "garagesnap" }, // annual
  // MeetingSnap (independent 4-tier model)
  "price_1U6km5Qf4SDuORrEPTtvKzCe": { kind: "meetingsnap", meetingTier: "personal" }, // Personal monthly
  "price_1U6kmXQf4SDuORrE1pfncl4K": { kind: "meetingsnap", meetingTier: "personal" }, // Personal annual
  "price_1U6kntQf4SDuORrEtqIA2PCv": { kind: "meetingsnap", meetingTier: "pro" }, // Pro monthly
  "price_1U6koLQf4SDuORrE62WRLvIw": { kind: "meetingsnap", meetingTier: "pro" }, // Pro annual
  "price_1U6kkQf4SDuORrE1LiJ4Ytx": { kind: "meetingsnap", meetingTier: "free" }, // Free — harmless no-op
};

/** Read the first line item's price id off a Subscription object (or its
 *  default_price) for demotion routing. Returns undefined if absent. */
function subscriptionPriceId(subscription: Stripe.Subscription): string | undefined {
  const first = subscription.items?.data?.[0]?.price?.id;
  if (first) return first;
  return typeof subscription.default_price === "string"
    ? subscription.default_price
    : subscription.default_price?.id;
}

/** Revoke exactly the entitlement the ending subscription paid for. Each
 *  subscription demotes precisely the thing it granted — the DocSnap tier, a
 *  module add-on flag, or the MeetingSnap tier. Unknown/absent → safe DocSnap
 *  free demotion (never grants, never crashes; logs on error via helpers). */
async function revokeSubscriptionEntitlement(
  clerkUserId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const priceId = subscriptionPriceId(subscription);
  const entitlement = priceId ? PRICE_ENTITLEMENTS[priceId] : undefined;
  if (!entitlement) {
    await setFreeSubscription(clerkUserId);
    console.log(
      `[stripe-webhook] Unknown/absent price (${priceId ?? "(none)"}) — demoted DocSnap to free for user ${clerkUserId}`,
    );
    return;
  }
  switch (entitlement.kind) {
    case "docsnap":
      await setFreeSubscription(clerkUserId);
      console.log(`[stripe-webhook] DocSnap subscription ended — set free for user ${clerkUserId}`);
      break;
    case "receiptsnap":
      await setReceiptSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] ReceiptSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "garagesnap":
      await setGarageSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] GarageSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "meetingsnap":
      await setMeetingSubscriptionTier(clerkUserId, "free");
      console.log(`[stripe-webhook] MeetingSnap subscription ended — set free for user ${clerkUserId}`);
      break;
  }
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
