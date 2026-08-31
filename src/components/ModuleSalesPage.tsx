import { Link } from "@tanstack/react-router";
import { CheckoutLink } from "./CheckoutLink";

/**
 * Shared sales/landing page layout for the VeraKeep™ add-on modules that live
 * inside DocSnap. Modeled on the HomeSnap sales page (src/routes/homesnap-sales.tsx):
 * dark gray/indigo treatment, hero with a single primary CTA, a "benefits"
 * block, a "what you can do" feature rundown, a two-card monthly/yearly price
 * block, a final CTA with microcopy, and a footer.
 *
 * Each module supplies its own copy via the `ModuleSalesConfig` prop; the Buy
 * CTAs reuse the existing real Stripe checkout URLs from `~/moduleCheckout` —
 * no new prices are invented here.
 */

export type Benefit = { title: string; body: string };

export interface ModuleSalesConfig {
  /** Short module name, e.g. "HomeSnap". */
  moduleName: string;
  /** Emoji shown in the header logo tile. */
  logo: string;
  /** Page meta title (also used as the <title>). */
  metaTitle: string;
  /** Page meta description. */
  metaDescription: string;
  /** Hero eyebrow label, e.g. "ReceiptSnap". */
  eyebrow: string;
  /** Hero headline. */
  headline: string;
  /** Hero supporting paragraph. */
  subhead: string;
  /** Primary CTA label (before the price), e.g. "Start your home record". */
  ctaPrimary: string;
  /** Primary CTA monthly price string, e.g. "$2.99/month". */
  ctaPrimaryPrice: string;
  /** Secondary yearly line under the CTA, e.g. "or $29.99/year — two months free". */
  ctaSecondary: string;
  /** Monthly checkout URL (existing real Stripe link). */
  primaryHref: string;
  /** Primary CTA button text, e.g. "Get ReceiptSnap — $2.99/month". */
  primaryButton: string;
  /** Annual checkout URL (existing real Stripe link). */
  yearlyHref: string;
  /** Annual CTA button text, e.g. "Get ReceiptSnap — $29.99/year". */
  yearlyButton: string;
  /** Monthly price shown in the price card, e.g. "$2.99". */
  monthlyPrice: string;
  /** Annual price shown in the price card, e.g. "$29.99". */
  yearlyPrice: string;
  /** Optional badge on the yearly card, e.g. "two months free". */
  yearlyBadge?: string;
  /** Small "≈ $/mo" line for the yearly card, e.g. "≈ $2.50/mo". */
  yearlyApx?: string;
  /** Monthly card blurb. */
  monthlyBlurb: string;
  /** Yearly card blurb. */
  yearlyBlurb: string;
  /** Card tagline line, e.g. "Full HomeSnap access". */
  cardLine: string;
  /** Heading of the "benefits" section, e.g. "Why keep a home record at all?". */
  benefitsHeading: string;
  benefits: Benefit[];
  /** Heading of the feature rundown, e.g. "What you can do". */
  featuresHeading: string;
  features: string[];
  /** Microcopy note above the price block ("Cancel anytime" etc.). Overrides default. */
  priceNote?: string;
  /** Text of the "not sure where to start" help box title. */
  startNoteTitle: string;
  /** Body of the "not sure where to start" help box. */
  startNoteBody: string;
  /** Optional secondary link (e.g. demo or app) shown in the final footer area. */
  footerLink?: { to: string; label: string };
  /** Optional note in hero microcopy. Defaults to the shared "Inside your DocSnap account..." line. */
  heroMicrocopy?: string;
}

export function ModuleSalesPage(config: ModuleSalesConfig) {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg">
            {config.logo}
          </span>
          DocSnap
        </Link>
        {config.footerLink ? (
          <Link
            to={config.footerLink.to as "/"}
            className="text-sm text-gray-400 transition hover:text-gray-200"
          >
            {config.footerLink.label} →
          </Link>
        ) : (
          <span className="text-sm text-gray-500">{config.moduleName} · a VeraKeep module</span>
        )}
      </header>

      {/* Hero */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-indigo-400">{config.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {config.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            {config.subhead}
          </p>
          <div className="mt-8">
            <CheckoutLink
              href={config.primaryHref}
              className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
            >
              {config.ctaPrimary} — {config.ctaPrimaryPrice}
            </CheckoutLink>
            <p className="mt-3 text-sm text-gray-400">{config.ctaSecondary}</p>
          </div>
          <p className="mt-5 text-xs text-gray-600">
            {config.heroMicrocopy ??
              "Inside your DocSnap account. Cancel anytime. No credit card required to browse."}
          </p>
        </div>
      </section>

      {/* Benefit sections */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {config.benefitsHeading}
          </h2>
          <div className="mt-10 space-y-8">
            {config.benefits.map((b) => (
              <div key={b.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
                <h3 className="text-xl font-semibold">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-300">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can do — feature rundown */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {config.featuresHeading}
          </h2>
          <ul className="mt-8 space-y-3">
            {config.features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-gray-300">
                <span className="mt-0.5 text-indigo-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Price block */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Simple, honest pricing
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
              <p className="text-sm font-medium text-gray-400">Monthly</p>
              <p className="mt-3 text-4xl font-bold">
                {config.monthlyPrice}
                <span className="text-base font-normal text-gray-400">/month</span>
              </p>
              <p className="mt-3 text-sm text-gray-400">{config.monthlyBlurb}</p>
              <p className="mt-1 text-sm text-gray-300">{config.cardLine}</p>
              <CheckoutLink
                href={config.primaryHref}
                className="mt-6 inline-flex justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                {config.primaryButton}
              </CheckoutLink>
            </div>
            <div className="flex flex-col rounded-2xl border border-indigo-700/60 bg-indigo-950/30 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-indigo-300">Yearly · Best value</p>
                {config.yearlyBadge && (
                  <span className="rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs font-medium text-indigo-200">
                    {config.yearlyBadge}
                  </span>
                )}
              </div>
              <p className="mt-3 text-4xl font-bold">
                {config.yearlyPrice}
                <span className="text-base font-normal text-gray-400">/year</span>
              </p>
              <p className="mt-2 text-xs text-gray-500">{config.yearlyApx}</p>
              <p className="mt-2 text-sm text-gray-400">{config.yearlyBlurb}</p>
              <p className="mt-1 text-sm text-gray-300">{config.cardLine}, two months free</p>
              <CheckoutLink
                href={config.yearlyHref}
                className="mt-6 inline-flex justify-center rounded-full border border-indigo-500 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-600/20"
              >
                {config.yearlyButton}
              </CheckoutLink>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-sm text-gray-400">
            {config.priceNote ?? (
              <>
                One {config.moduleName.toLowerCase()} record, all your data, on one price — either
                way. <span className="text-gray-500">Cancel anytime.</span>
              </>
            )}
          </p>
        </div>
      </section>

      {/* Final CTA + microcopy */}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <CheckoutLink
            href={config.primaryHref}
            className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
          >
            {config.primaryButton}
          </CheckoutLink>
          <p className="mt-3 text-sm text-gray-400">Yearly option — {config.yearlyPrice}/year</p>
          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-left">
            <p className="text-sm leading-relaxed text-gray-300">
              <span className="font-semibold text-gray-100">{config.startNoteTitle}</span>{" "}
              {config.startNoteBody}
            </p>
          </div>
          {config.footerLink && (
            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-gray-500">
              <Link to={config.footerLink.to as "/"} className="transition hover:text-gray-300">
                {config.footerLink.label} →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/pricing" className="transition hover:text-gray-400">Pricing</Link>
        <Link to="/privacy" className="transition hover:text-gray-400">Privacy</Link>
        <Link to="/terms" className="transition hover:text-gray-400">Terms</Link>
        <Link to="/contact" className="transition hover:text-gray-400">Contact</Link>
      </footer>
    </main>
  );
}
