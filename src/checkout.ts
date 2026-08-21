/**
 * Checkout URL config — the single source of truth for the pricing page's
 * "Subscribe" links.
 *
 * The real recurring buy.stripe.com URLs for the new 3-tier model are owned
 * by the owner in Stripe and will be provided by the team lead AFTER this
 * code change lands. Do NOT fabricate buy.stripe.com URLs.
 *
 * To go live: fill in the four URLs below (the lead will insert the real
 * Personal/Family monthly + annual Stripe payment-link URLs). The pricing
 * page reads these constants, so dropping in the real URL requires no page
 * logic changes.
 *
 * @example
 *   PERSONAL_MONTHLY: "https://buy.stripe.com/..." // TODO(lead): insert real URL
 */
export const CHECKOUT_URLS = {
  /** Personal — $5.99/month recurring. */
  PERSONAL_MONTHLY: "https://buy.stripe.com/9B6fZj4KN3IL7bxdOm7Re0g",
  /** Personal — $59.99/year recurring. */
  PERSONAL_ANNUAL: "https://buy.stripe.com/9B69AVdhj1AD67t11A7Re0e",
  /** Family — $8.99/month recurring. */
  FAMILY_MONTHLY: "https://buy.stripe.com/00w3cxgtv5QTbrNeSq7Re0f",
  /** Family — $89.99/year recurring. */
  FAMILY_ANNUAL: "https://buy.stripe.com/bJe14pa57bbd3ZlaCa7Re0d",
} as const;
