/**
 * Entitlement routing + pending-grant reconciliation.
 *
 * SINGLE SOURCE OF TRUTH for what a Stripe checkout price grants (the DocSnap
 * tier, a module add-on flag, the MeetingSnap tier, or the whole All Access
 * bundle). Shared by:
 *  - the Stripe webhook (grant on `checkout.session.completed`), and
 *  - the pending-entitlement queue (reconcile an anonymous purchase onto the
 *    user once they complete sign-in with the buying email).
 *
 * Everything here is ADDITIVE and FAILS CLOSED: an unknown / unlisted price
 * grants nothing. It never invents a grant and never grants before Stripe has
 * confirmed a payment — it is only ever called with a verified checkout.
 *
 * NOTE on identity security: the queue only ever records what a buyer PAID for
 * (a real Stripe checkout at a known price). It is keyed by the checkout email
 * and reconciled onto the Clerk user who later signs in with that SAME email.
 * A `client_reference_id` (set by the Buy buttons for signed-in buyers) only
 * selects WHICH Clerk user to grant to — you still pay for exactly what you
 * get, so this cannot be exploited to gain access without paying.
 */

import { sql } from "./db";
import {
  setSubscriptionTier,
  setReceiptSnapAddon,
  setGarageSnapAddon,
  setBillSnapAddon,
  setContractSnapAddon,
  setHomeSnapAddon,
  setBookSnapAddon,
  setMeetingSubscriptionTier,
  RECEIPTSNAP_ADDON_PRODUCT_ID,
  type Tier,
} from "./subscription";

/** DocSnap paid tiers a checkout price can grant: Personal or Family. */
export type PaidTier = Exclude<Tier, "free">;

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
  // ── NEW DocSnap prices (2026 price change) ──
  "price_1UA7frQf4SDuORrEX5BWEcJT": "personal", // Personal monthly
  "price_1UA7d0Qf4SDuORrERGvVGUVk": "family", // Family monthly
  "price_1UA7dRQf4SDuORrEwhEVzZEC": "family", // Family yearly
};

export function priceTier(priceId: string | undefined): PaidTier {
  return (priceId && PRICE_TIERS[priceId]) || "personal";
}

type EntitlementKind =
  | "docsnap"
  | "receiptsnap"
  | "garagesnap"
  | "billsnap"
  | "contractsnap"
  | "homesnap"
  | "meetingsnap"
  | "booksnap"
  | "allaccess";

interface PriceEntitlement {
  kind: EntitlementKind;
  /** MeetingSnap tier when kind === 'meetingsnap' (else unused). */
  meetingTier?: string;
  /** DocSnap tier granted by the VeraKeep All Access bundle when
   *  kind === 'allaccess' (else unused). */
  bundleTier?: PaidTier;
}

/**
 * Every known module + DocSnap price → its entitlement. DocSnap tiers are
 * resolved via priceTier() (PRICE_TIERS above, incl. legacy folds); the entry
 * here only marks the price as a DocSnap checkout. Unknown prices route to no
 * entitlement and are FAIL CLOSED (grant nothing, just log).
 */
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
  // ── NEW DocSnap prices (2026 price change) ──
  "price_1UA7frQf4SDuORrEX5BWEcJT": { kind: "docsnap" }, // Personal monthly
  "price_1UA7d0Qf4SDuORrERGvVGUVk": { kind: "docsnap" }, // Family monthly
  "price_1UA7dRQf4SDuORrEwhEVzZEC": { kind: "docsnap" }, // Family yearly
  // ContractSnap add-on ($4.99/mo, $49.99/yr)
  "price_1U6q0FQf4SDuORrEWBlPdxe5": { kind: "contractsnap" }, // monthly
  "price_1U6q17Qf4SDuORrEix17ztf7": { kind: "contractsnap" }, // annual
  // ReceiptSnap add-on
  "price_1U6kfsQf4SDuORrEjRw4yNQN": { kind: "receiptsnap" }, // monthly
  "price_1U6khZQf4SDuORrE0ULOHWTT": { kind: "receiptsnap" }, // annual
  // GarageSnap add-on
  "price_1U6kjFQf4SDuORrEVVcQ82hO": { kind: "garagesnap" }, // monthly
  "price_1U6kjaQf4SDuORrEfYIEGIX1": { kind: "garagesnap" }, // annual
  // BillSnap add-on
  "price_1U6prlQf4SDuORrEAHPWd5hH": { kind: "billsnap" }, // monthly
  "price_1U6ps8Qf4SDuORrEE4T4xr2d": { kind: "billsnap" }, // annual
  // HomeSnap add-on
  "price_1U6px3Qf4SDuORrE0QdJIo1Y": { kind: "homesnap" }, // monthly
  "price_1U6pxfQf4SDuORrElHyfBaae": { kind: "homesnap" }, // annual
  // BookSnap add-on ($3.99/mo, $39.99/yr)
  "price_1U8ZUwQf4SDuORrEWXCzi5uY": { kind: "booksnap" }, // monthly $3.99
  "price_1U8ZVFQf4SDuORrEJQrl6TMt": { kind: "booksnap" }, // yearly $39.99
  // MeetingSnap (independent 4-tier model)
  "price_1U6km5Qf4SDuORrEPTtvKzCe": { kind: "meetingsnap", meetingTier: "personal" }, // Personal monthly
  "price_1U6kmXQf4SDuORrE1pfncl4K": { kind: "meetingsnap", meetingTier: "personal" }, // Personal annual
  "price_1U6kntQf4SDuORrEtqIA2PCv": { kind: "meetingsnap", meetingTier: "pro" }, // Pro monthly
  "price_1U6koLQf4SDuORrE62WRLvIw": { kind: "meetingsnap", meetingTier: "pro" }, // Pro annual
  "price_1U6kkQf4SDuORrE1LiJ4Ytx": { kind: "meetingsnap", meetingTier: "free" }, // Free — harmless no-op
  // VeraKeep All Access bundle — grants DocSnap (Personal/Family) + all seven
  // module add-ons (ReceiptSnap + GarageSnap + MeetingSnap Personal + HomeSnap
  // + ContractSnap + BillSnap + BookSnap) in one checkout.
  // Pre-price-change ("old") IDs, kept for existing subscribers.
  "price_1U6kqkQf4SDuORrEoLEI1tPk": { kind: "allaccess", bundleTier: "personal" }, // Individual monthly ($11.99)
  "price_1U6kufQf4SDuORrEWjOSH4cY": { kind: "allaccess", bundleTier: "personal" }, // Individual annual ($119.99)
  "price_1U6kw9Qf4SDuORrEjfbf8nV5": { kind: "allaccess", bundleTier: "family" }, // Family monthly ($17.99)
  "price_1U6kxKQf4SDuORrEhoVI8wqF": { kind: "allaccess", bundleTier: "family" }, // Family annual ($179.99)
  // ── NEW All Access prices (2026 price change) ──
  "price_1UA7bCQf4SDuORrEsqdCo2XT": { kind: "allaccess", bundleTier: "personal" }, // Individual monthly ($19.99)
  "price_1UA7byQf4SDuORrEDbEQ9chv": { kind: "allaccess", bundleTier: "personal" }, // Individual yearly ($199.99)
  "price_1UA7evQf4SDuORrEWSQToZT0": { kind: "allaccess", bundleTier: "family" }, // Family monthly ($24.99)
  "price_1UA7fQQf4SDuORrEM1qRWnbE": { kind: "allaccess", bundleTier: "family" }, // Family yearly ($249.99)
};

export { PRICE_ENTITLEMENTS, PRICE_TIERS };

/** Outcome of applyEntitlementToUser. `unknown` = price couldn't be mapped. */
export type GrantStatus = "granted" | "unknown";

/**
 * Grant exactly the entitlement a completed checkout of `priceId` paid for on
 * `clerkUserId`. FAILS CLOSED: unknown/unlisted price grants nothing and
 * returns "unknown" so the caller can log it. All setters are idempotent
 * upserts, so re-granting on a Stripe retry is harmless.
 */
export async function applyEntitlementToUser(
  clerkUserId: string,
  priceId: string | undefined,
  stripeCustomerId = "",
): Promise<GrantStatus> {
  // Legacy env-based ReceiptSnap add-on product fallback (kept for existing
  // subscribers). When unset it gracefully no-ops so normal checkouts flow
  // through the entitlement map below.
  if (priceId && RECEIPTSNAP_ADDON_PRODUCT_ID && priceId === RECEIPTSNAP_ADDON_PRODUCT_ID) {
    await setReceiptSnapAddon(clerkUserId, true);
    return "granted";
  }

  const entitlement = priceId ? PRICE_ENTITLEMENTS[priceId] : undefined;
  if (!entitlement) return "unknown";

  switch (entitlement.kind) {
    case "docsnap": {
      const tier = priceTier(priceId);
      await setSubscriptionTier(clerkUserId, tier, stripeCustomerId);
      console.log(`[entitlements] Set DocSnap ${tier} for user ${clerkUserId}`);
      break;
    }
    case "receiptsnap":
      await setReceiptSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted ReceiptSnap add-on for user ${clerkUserId}`);
      break;
    case "garagesnap":
      await setGarageSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted GarageSnap add-on for user ${clerkUserId}`);
      break;
    case "billsnap":
      await setBillSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted BillSnap add-on for user ${clerkUserId}`);
      break;
    case "contractsnap":
      await setContractSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted ContractSnap add-on for user ${clerkUserId}`);
      break;
    case "homesnap":
      await setHomeSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted HomeSnap add-on for user ${clerkUserId}`);
      break;
    case "booksnap":
      await setBookSnapAddon(clerkUserId, true);
      console.log(`[entitlements] Granted BookSnap add-on for user ${clerkUserId}`);
      break;
    case "meetingsnap": {
      const meetingTier = entitlement.meetingTier ?? "free";
      await setMeetingSubscriptionTier(clerkUserId, meetingTier as Parameters<typeof setMeetingSubscriptionTier>[1]);
      console.log(`[entitlements] Set MeetingSnap ${meetingTier} for user ${clerkUserId}`);
      break;
    }
    case "allaccess": {
      // VeraKeep All Access — one checkout grants the DocSnap tier (Personal or
      // Family) plus the FULL seven-module suite: ReceiptSnap + GarageSnap +
      // MeetingSnap Personal + HomeSnap + ContractSnap + BillSnap + BookSnap.
      const tier = entitlement.bundleTier ?? "personal";
      await setSubscriptionTier(clerkUserId, tier, stripeCustomerId);
      await setReceiptSnapAddon(clerkUserId, true);
      await setGarageSnapAddon(clerkUserId, true);
      await setMeetingSubscriptionTier(clerkUserId, "personal");
      await setHomeSnapAddon(clerkUserId, true);
      await setContractSnapAddon(clerkUserId, true);
      await setBillSnapAddon(clerkUserId, true);
      await setBookSnapAddon(clerkUserId, true);
      console.log(
        `[entitlements] Granted VeraKeep All Access (${tier}) to user ${clerkUserId}: DocSnap ${tier} + all seven modules`,
      );
      break;
    }
  }
  return "granted";
}

// ---------------------------------------------------------------------------
// Pending entitlement queue
//
// When a checkout completes but we can't yet map it to a Clerk user (an
// anonymous buyer, or a buyer whose email hasn't been synced into `users`), we
// do NOT drop it — that would be "paid but never granted". Instead we record
// what was paid for (the email + price) so it can be granted the moment the
// buying email completes sign-in (reconciled from `upsertUser`).
// ---------------------------------------------------------------------------

export interface PendingEntitlement {
  email: string;
  priceId?: string;
  stripeCustomerId?: string;
  checkoutSessionId?: string;
}

/** Record a completed checkout that has no identifiable Clerk user yet.
 *  Idempotent per checkout session (a unique key) so Stripe webhook retries
 *  never double-queue. FAILS CLOSED: deduped and never grants by itself. */
export async function enqueuePendingEntitlement(
  pending: PendingEntitlement,
): Promise<void> {
  try {
    const session = pending.checkoutSessionId ?? null;
    await sql`
      INSERT INTO pending_entitlements (email, price_id, stripe_customer_id, checkout_session_id)
      VALUES (${pending.email}, ${pending.priceId ?? null}, ${pending.stripeCustomerId ?? null}, ${session})
      ON CONFLICT (checkout_session_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[entitlements] Failed to enqueue pending entitlement:", err);
  }
}

/**
 * Grant every un-reconciled pending purchase bought with this email onto the
 * now-known `clerkUserId`. Called when the user completes sign-in (upsertUser).
 * FAILS CLOSED: an unknown price in a pending row grants nothing but is still
 * marked reconciled (so it doesn't retry forever); each known price grants
 * exactly what it paid for.
 */
export async function reconcilePendingEntitlements(
  email: string,
  clerkUserId: string,
): Promise<number> {
  let count = 0;
  try {
    const rows = (await sql`
      SELECT id, price_id, stripe_customer_id
      FROM pending_entitlements
      WHERE email = ${email} AND reconciled_at IS NULL
      ORDER BY created_at ASC
    `) as { id: number; price_id: string | null; stripe_customer_id: string | null }[];

    for (const row of rows) {
      const status = await applyEntitlementToUser(
        clerkUserId,
        row.price_id ?? undefined,
        row.stripe_customer_id ?? "",
      );
      if (status === "unknown") {
        console.warn(
          `[entitlements] Pending purchase (id ${row.id}, price ${row.price_id ?? "(none)"}) has no known entitlement — marked reconciled without granting`,
        );
      }
      await sql`
        UPDATE pending_entitlements
        SET reconciled_at = NOW(), reconciled_for = ${clerkUserId}
        WHERE id = ${row.id}
      `;
      count++;
    }
  } catch (err) {
    console.error("[entitlements] Failed to reconcile pending entitlements:", err);
  }
  return count;
}
