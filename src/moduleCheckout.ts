/**
 * VeraKeep module checkout URLs — the single source of truth for the
 * add-on module "Buy" links on the landing and pricing pages.
 *
 * The real recurring buy.stripe.com URLs for each module are owned by the
 * owner in Stripe and will be provided by the team lead AFTER this code
 * change lands. Do NOT fabricate buy.stripe.com URLs.
 *
 * To go live: fill in the six URLs below (the lead will insert the real
 * monthly + annual Stripe payment-link URLs for each module). The landing
 * and pricing pages read these constants, so dropping in the real URLs
 * requires no page logic changes.
 *
 * @example
 *   RECEIPTSNAP_MONTHLY: "https://buy.stripe.com/..." // TODO(lead): insert real URL
 */
export const MODULE_CHECKOUT_URLS = {
  /** ReceiptSnap — $2.99/month recurring. */
  RECEIPTSNAP_MONTHLY: "https://buy.stripe.com/8x2dRb7WZbbd1Rd6lU7Re0c",
  /** ReceiptSnap — $29.99/year recurring. */
  RECEIPTSNAP_ANNUAL: "https://buy.stripe.com/dRm7sN3GJbbd2Vh5hQ7Re0b",
  /** GarageSnap — $2.99/month recurring. */
  GARAGESNAP_MONTHLY: "https://buy.stripe.com/8x2aEZ913cfheDZcKi7Re0a",
  /** GarageSnap — $29.99/year recurring. */
  GARAGESNAP_ANNUAL: "https://buy.stripe.com/aFacN7dhjenp1Rd39I7Re09",
  /** MeetingSnap Personal — $5.99/month recurring. */
  MEETINGSNAP_PERSONAL_MONTHLY: "https://buy.stripe.com/00waEZdhjbbd53peSq7Re07",
  /** MeetingSnap Personal — $59.99/year recurring. */
  MEETINGSNAP_PERSONAL_ANNUAL: "https://buy.stripe.com/00wdRb4KNbbdgM7dOm7Re06",
  /** MeetingSnap Pro — $14.99/month recurring. */
  MEETINGSNAP_PRO_MONTHLY: "https://buy.stripe.com/7sYdRb7WZ6UX9jFcKi7Re05",
  /** MeetingSnap Pro — $149.99/year recurring. */
  MEETINGSNAP_PRO_ANNUAL: "https://buy.stripe.com/cNi4gBb9b935brNaCa7Re04",
  /**
   * HomeSnap — PRICING/GATING PENDING OWNER. Whether HomeSnap is bundled into a
   * tier or sold as a separate add-on (and at what price) is a business decision
   * that has not been made. These are left EMPTY on purpose so no fabricated
   * Stripe URL is ever shown; the module's Buy/upgrade buttons are inert until
   * the lead inserts the real monthly + annual payment links. It ships phase-1
   * auth-gated (any signed-in user can use it) — no hard add-on gate yet.
   */
  HOMESNAP_MONTHLY: "",
  HOMESNAP_ANNUAL: "",
} as const;
