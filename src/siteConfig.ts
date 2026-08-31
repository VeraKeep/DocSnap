/**
 * Single source of truth for DocSnap's canonical origin and URL helpers.
 *
 * The bare apex (docsnapapp.com) is the brand's primary/canonical host. Every
 * canonical, structured-data, OG/meta and sitemap URL in the codebase must be
 * derived from {@link SITE_ORIGIN} through these helpers so nothing ever drifts
 * to `www.docsnapapp.com` or an environment subdomain in SEO metadata.
 */
export const SITE_ORIGIN = "https://docsnapapp.com";

/**
 * Build an absolute canonical URL for a route path, e.g.
 * `canonicalUrl("/pricing")` => `https://docsnapapp.com/pricing`.
 */
export function canonicalUrl(path = "/"): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Build an absolute URL for a public asset, e.g.
 * `assetUrl("/icon-512.png")` => `https://docsnapapp.com/icon-512.png`.
 */
export function assetUrl(path = "/"): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
