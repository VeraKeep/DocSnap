/**
 * Checkout URL config — the single source of truth for the pricing page's
 * "Subscribe" links.
 *
 * Recurring buy.stripe.com URLs for the 3-tier model, provided by the owner.
 * The pricing page reads these constants, so dropping in the real URL requires
 * no page logic changes.
 */
export const CHECKOUT_URLS = {
  /** Personal — $5.99/month recurring. */
  PERSONAL_MONTHLY: "https://buy.stripe.com/5kQ8wR5ORa792VhbGe7Re0q",
  /** Personal — $59.99/year recurring. */
  PERSONAL_ANNUAL: "https://buy.stripe.com/9B69AVdhj1AD67t11A7Re0e",
  /** Family — $9.99/month recurring. */
  FAMILY_MONTHLY: "https://buy.stripe.com/9B69AVcdf2EH67t11A7Re0u",
  /** Family — $99.99/year recurring. */
  FAMILY_ANNUAL: "https://buy.stripe.com/8x26oJ4KNenpanJ25E7Re0t",
} as const;
