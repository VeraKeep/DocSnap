/**
 * VeraKeep All Access bundle checkout URLs — the single source of truth for
 * the bundle's "Buy" links on the pricing page and landing page CTA.
 *
 * These are the real recurring buy.stripe.com URLs provided by the owner for
 * the two All Access bundles (individual and family), monthly + annual. Do NOT
 * fabricate buy.stripe.com URLs — if a URL is missing, leave it out and drop a
 * TODO(lead) note rather than inventing one.
 * @see https://github.com/org/repo/blob/main/src/moduleCheckout.ts for the
 *      parallel single-module checkout config.
 */
export const ALL_ACCESS_CHECKOUT_URLS = {
  /** VeraKeep All Access (individual) — $11.99/month recurring. */
  BUNDLE_INDIVIDUAL_MONTHLY: "https://buy.stripe.com/3cIeVfa571ADdzVh0y7Re03",
  /** VeraKeep All Access (individual) — $119.99/year recurring. */
  BUNDLE_INDIVIDUAL_ANNUAL: "https://buy.stripe.com/28EeVf9135QTeDZh0y7Re02",
  /** VeraKeep All Access Family — $17.99/month recurring. */
  BUNDLE_FAMILY_MONTHLY: "https://buy.stripe.com/eVqaEZcdf0wzcvR11A7Re01",
  /** VeraKeep All Access Family — $179.99/year recurring. */
  BUNDLE_FAMILY_ANNUAL: "https://buy.stripe.com/6oU7sNfprgvx2Vh4dM7Re00",
} as const;
