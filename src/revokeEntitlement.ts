/**
 * Shared subscription-REVOKE (cancel / downgrade) routing.
 *
 * This is the single place that decides what a customer LOSES when a
 * subscription ends (cancel) or downgrades, based on the price id of the
 * subscription that ended. It is the exact inverse of
 * `applyEntitlementToUser` in `entitlements.ts` (grant side) and lives here so
 * BOTH the Stripe webhook (src/routes/api/-stripe-webhook.ts) and the
 * cancellation/downgrade verify script (scripts/verifyCancellationDowngrade.ts)
 * can drive the SAME production code path.
 *
 * CRITICAL INVARIANT: every revoke here only ever touches the `users`
 * entitlement columns (tier / add-on flags / meeting tier). It NEVER deletes a
 * customer's data rows (receipts, meetings, bills, contracts, garage items,
 * properties, books, share links) — none of those tables have a FK to `users`,
 * and nothing in this module issues a DELETE against them. Cancellation changes
 * ACCESS, never the data. Each setter FAILS CLOSED / logs and never throws.
 */

import {
  setFreeSubscription,
  setReceiptSnapAddon,
  setGarageSnapAddon,
  setBillSnapAddon,
  setContractSnapAddon,
  setHomeSnapAddon,
  setBookSnapAddon,
  setMeetingSubscriptionTier,
} from "./subscription";
import { PRICE_ENTITLEMENTS } from "./entitlements";

/** Read the first line item's price id off a Subscription-shaped object (or
 *  its default_price) for demotion routing. Returns undefined if absent. */
export function subscriptionPriceId(subscription: {
  items?: { data?: { price?: { id?: string } }[] };
  default_price?: string | { id?: string };
}): string | undefined {
  const first = subscription.items?.data?.[0]?.price?.id;
  if (first) return first;
  const defPrice = subscription.default_price;
  return typeof defPrice === "string" ? defPrice : defPrice?.id;
}

/** Revoke exactly the entitlement the ending subscription paid for. Each
 *  subscription demotes precisely the thing it granted — the DocSnap tier, a
 *  module add-on flag, or the MeetingSnap tier. Unknown/absent → safe DocSnap
 *  free demotion (never grants, never crashes; logs on error via helpers).
 */
export async function revokeSubscriptionEntitlement(
  clerkUserId: string,
  subscription: Parameters<typeof subscriptionPriceId>[0],
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
    case "billsnap":
      await setBillSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] BillSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "contractsnap":
      await setContractSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] ContractSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "homesnap":
      await setHomeSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] HomeSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "booksnap":
      await setBookSnapAddon(clerkUserId, false);
      console.log(`[stripe-webhook] BookSnap subscription ended — revoked add-on for user ${clerkUserId}`);
      break;
    case "meetingsnap":
      await setMeetingSubscriptionTier(clerkUserId, "free");
      console.log(`[stripe-webhook] MeetingSnap subscription ended — set free for user ${clerkUserId}`);
      break;
    case "allaccess":
      // VeraKeep All Access ended — revoke exactly what the bundle granted:
      // DocSnap tier + all seven module add-ons.
      await setFreeSubscription(clerkUserId);
      await setReceiptSnapAddon(clerkUserId, false);
      await setGarageSnapAddon(clerkUserId, false);
      await setMeetingSubscriptionTier(clerkUserId, "free");
      await setHomeSnapAddon(clerkUserId, false);
      await setContractSnapAddon(clerkUserId, false);
      await setBillSnapAddon(clerkUserId, false);
      await setBookSnapAddon(clerkUserId, false);
      console.log(
        `[stripe-webhook] VeraKeep All Access ended — revoked DocSnap + all seven modules (ReceiptSnap, GarageSnap, MeetingSnap, HomeSnap, ContractSnap, BillSnap, BookSnap) for user ${clerkUserId}`,
      );
      break;
  }
}
