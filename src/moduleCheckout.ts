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
/** BillSnap — $2.99/month recurring add-on. */
BILLSNAP_MONTHLY: "https://buy.stripe.com/dRm8wR9132EHeDZcKi7Re0i",
/** BillSnap — $29.99/year recurring add-on. */
BILLSNAP_ANNUAL: "https://buy.stripe.com/fZu7sNcdfgvxeDZbGe7Re0j",
/** HomeSnap — PAID ADD-ON (owner decision, business-plan rev 2): $3.99/mo or
 *  $39.99/yr, gated by an addon_homesnap flag (phase 3). Real recurring
 *  Stripe payment links provided by the owner. */
HOMESNAP_MONTHLY: "https://buy.stripe.com/cNidRb6SVenpgM7h0y7Re0k",
HOMESNAP_ANNUAL: "https://buy.stripe.com/bJe14pb9bdjl67t39I7Re0l",
/** ContractSnap — priced add-on ($4.99/mo or $49.99/yr). Real recurring
 *  Stripe payment links provided by the owner. */
CONTRACTSNAP_MONTHLY: "https://buy.stripe.com/aFa28tgtv3IL8fB6lU7Re0m",
CONTRACTSNAP_ANNUAL: "https://buy.stripe.com/5kQfZj6SV7Z1gM79y67Re0n",
/** BookSnap — paid add-on ($3.99/mo or $39.99/yr). Real recurring Stripe
 *  payment links provided by the owner. */
BOOKSNAP_MONTHLY: "https://buy.stripe.com/6oU14p2CFbbd9jFh0y7Re0o",
BOOKSNAP_ANNUAL: "https://buy.stripe.com/aFa6oJa57djlfI3cKi7Re0p",
} as const;
