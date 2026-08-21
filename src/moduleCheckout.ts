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
  /** ReceiptSnap — $2.99/month recurring. TODO(lead): insert real URL. */
  RECEIPTSNAP_MONTHLY: "",
  /** ReceiptSnap — $29.99/year recurring. TODO(lead): insert real URL. */
  RECEIPTSNAP_ANNUAL: "",
  /** GarageSnap — $2.99/month recurring. TODO(lead): insert real URL. */
  GARAGESNAP_MONTHLY: "",
  /** GarageSnap — $29.99/year recurring. TODO(lead): insert real URL. */
  GARAGESNAP_ANNUAL: "",
  /** MeetingSnap Personal — $5.99/month recurring. TODO(lead): insert real URL. */
  MEETINGSNAP_PERSONAL_MONTHLY: "",
  /** MeetingSnap Personal — $59.99/year recurring. TODO(lead): insert real URL. */
  MEETINGSNAP_PERSONAL_ANNUAL: "",
} as const;
