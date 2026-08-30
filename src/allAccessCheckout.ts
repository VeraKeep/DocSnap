/**
 * VeraKeep All Access bundle checkout URLs — the single source of truth for
 * the bundle's "Buy" links on the pricing page and landing page CTA.
 *
 * These are the real recurring buy.stripe.com URLs provided by the owner for
 * the two All Access bundles (individual and family), monthly + annual.
 */
export const ALL_ACCESS_CHECKOUT_URLS = {
  /** VeraKeep All Access (individual) — $19.99/month recurring. */
  BUNDLE_INDIVIDUAL_MONTHLY: "https://buy.stripe.com/aFa6oJ7WZenp2Vh4dM7Re0w",
  /** VeraKeep All Access (individual) — $199.99/year recurring. */
  BUNDLE_INDIVIDUAL_ANNUAL: "https://buy.stripe.com/3cI4gB1yB4MP67teSq7Re0v",
  /** VeraKeep All Access Family — $24.99/month recurring. */
  BUNDLE_FAMILY_MONTHLY: "https://buy.stripe.com/14AcN75ORdjl53p5hQ7Re0s",
  /** VeraKeep All Access Family — $249.99/year recurring. */
  BUNDLE_FAMILY_ANNUAL: "https://buy.stripe.com/6oU9AV6SVbbd0N939I7Re0r",
} as const;
