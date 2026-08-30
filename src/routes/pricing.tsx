import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSubscription } from "../hooks/useSubscription";
import { CHECKOUT_URLS } from "../checkout";
import { MODULES } from "../modules";
import { MeetingSnapTiers } from "../components/MeetingSnapTiers";
import { ALL_ACCESS_CHECKOUT_URLS } from "../allAccessCheckout";

type BillingCadence = "monthly" | "annual";

interface Plan {
  name: string;
  price: { monthly: string; annual: string };
  cadence: { monthly: string; annual: string };
  description: string;
  badge?: string;
  /** Checkout URLs (from src/checkout.ts) for monthly/annual. Free has none. */
  checkout?: { monthly: string; annual: string };
  button: "current" | "subscribe";
  features: string[];
}

const PLANS: Plan[] = [
  {
    name: "DocSnap Free",
    price: { monthly: "$0", annual: "$0" },
    cadence: { monthly: "/forever", annual: "/forever" },
    description: "Simple, private scanning for everyone.",
    button: "current",
    features: [
      "Limited scans & uploads",
      "OCR text recognition & search",
      "Basic organization & search",
      "Download as PDF",
      "Local processing in your browser",
    ],
  },
  {
    name: "DocSnap Personal",
    price: { monthly: "$5.99", annual: "$59.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "Higher limits, AI organization, full search, and cloud storage.",
    badge: "Most Popular",
    checkout: { monthly: CHECKOUT_URLS.PERSONAL_MONTHLY, annual: CHECKOUT_URLS.PERSONAL_ANNUAL },
    button: "subscribe",
    features: [
      "Everything in Free",
      "Higher document limits",
      "OCR & AI document organization",
      "Full-text search",
      "PDF & export tools",
      "Unlimited cloud storage",
      "Password-protected PDFs",
      "AI document naming",
      "Expiration reminders",
      "Redaction tool & sensitive-info detection",
      "Shareable secure links",
      "Duplicate detection",
    ],
  },
  {
    name: "DocSnap Family",
    price: { monthly: "$9.99", annual: "$99.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "Everything in Personal, plus shared household storage and family organization.",
    badge: "Best Value",
    checkout: { monthly: CHECKOUT_URLS.FAMILY_MONTHLY, annual: CHECKOUT_URLS.FAMILY_ANNUAL },
    button: "subscribe",
    features: [
      "Everything in Personal",
      "Shared household storage",
      "Multiple users",
      "Family document organization",
    ],
  },
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — DocSnap © 2026" },
      {
        name: "description",
        content:
          "Choose DocSnap Free, Personal, or Family. Private browser scanning is free; paid plans add cloud storage, AI organization, and family sharing.",
      },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/pricing" }],
  }),
  component: PricingPage,
});

function CheckIcon() {
  return <span className="shrink-0 text-green-400" aria-hidden="true">✓</span>;
}

function PricingPage() {
  const { isPro, portalUrl } = useSubscription();
  const [billing, setBilling] = useState<BillingCadence>("monthly");

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link to="/" className="text-lg font-semibold hover:text-indigo-400">DocSnap © 2026</Link>
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">← Back to app</Link>
      </header>

      <section className="px-4 pt-14 text-center sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Plans for every kind of home</h1>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-400">
          Start scanning privately for free, then choose the plan that fits your documents, receipts, and household.
        </p>

        {/* Monthly / Annual billing toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900/60 p-1">
          {(["monthly", "annual"] as BillingCadence[]).map((cadence) => (
            <button
              key={cadence}
              type="button"
              onClick={() => setBilling(cadence)}
              className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors ${
                billing === cadence ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {cadence}
            </button>
          ))}
        </div>
        {billing === "annual" && (
          <p className="mt-3 text-xs text-green-400">Save ~2 months with annual billing.</p>
        )}
      </section>

      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 px-4 pb-16 pt-10 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
        {PLANS.map((plan, index) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${
              index === 1 ? "border-indigo-500/60 bg-indigo-950/30" : "border-gray-800 bg-gray-900/60"
            }`}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold">
                {plan.badge}
              </span>
            )}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <p className="mt-2 min-h-12 text-sm text-gray-400">{plan.description}</p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{plan.price[billing]}</span>
              <span className="text-sm text-gray-400">{plan.cadence[billing]}</span>
            </div>

            {plan.button === "current" ? (
              <span className="mt-5 inline-flex justify-center rounded-full border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-400">
                Current Plan
              </span>
            ) : (
              <a
                href={plan.checkout?.[billing] || "#"}
                onClick={(e) => {
                  if (!plan.checkout?.[billing]) {
                    e.preventDefault();
                  }
                }}
                className="mt-5 inline-flex justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500"
              >
                Subscribe
              </a>
            )}

            {index === 1 &&
              isPro &&
              (portalUrl ? (
                <a href={portalUrl} className="mt-2 text-center text-xs text-indigo-300 hover:underline">
                  Already subscribed? Manage subscription
                </a>
              ) : (
                <span className="mt-2 text-center text-xs text-gray-500">Already subscribed?</span>
              ))}

            <ul className="mt-7 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* VeraKeep All Access bundle */}
      <section className="border-t border-gray-800/50 bg-indigo-950/20 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/50 bg-indigo-900/40 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-300">
              ✨ Best value
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              VeraKeep All Access
            </h2>
            <p className="mx-auto mt-4 max-w-3xl leading-relaxed text-gray-400">
              DocSnap Personal plus the entire seven-module VeraKeep™ suite —
              ReceiptSnap, GarageSnap, MeetingSnap, HomeSnap, ContractSnap,
              BillSnap, and BookSnap — in one bundle for one simple price.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Individual bundle */}
            <div className="relative flex flex-col rounded-2xl border border-indigo-500/60 bg-gray-900/60 p-6 sm:p-7">
              <span className="absolute -top-3 left-5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold">
                Most Popular
              </span>
              <h3 className="text-xl font-bold">All Access</h3>
              <p className="mt-2 text-sm text-gray-400">
                The entire VeraKeep™ suite for one person. $19.99/mo — everything
                in DocSnap Personal + all seven add-ons: ReceiptSnap, GarageSnap,
                MeetingSnap, HomeSnap, ContractSnap, BillSnap, and BookSnap.
              </p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold">
                  {billing === "monthly" ? "$19.99" : "$199.99"}
                </span>
                <span className="text-sm text-gray-400">
                  {billing === "monthly" ? "/month" : "/year"}
                </span>
              </div>

              <a
                href={ALL_ACCESS_CHECKOUT_URLS[
                  billing === "monthly" ? "BUNDLE_INDIVIDUAL_MONTHLY" : "BUNDLE_INDIVIDUAL_ANNUAL"
                ]}
                className="mt-6 inline-flex justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500"
              >
                Get All Access
              </a>

              <ul className="mt-7 space-y-3">
                {[
                  "DocSnap Personal — scanning, OCR, cloud storage",
                  "ReceiptSnap — receipts, warranties, returns",
                  "GarageSnap — tools, equipment, maintenance",
                  "MeetingSnap Personal — AI meeting summaries",
                  "HomeSnap — your home & its systems on record",
                  "ContractSnap — key contract terms at a glance",
                  "BillSnap — know what you owe and when",
                  "BookSnap — every edition, page, and quote",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Family bundle */}
            <div className="relative flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-7">
              <h3 className="text-xl font-bold">All Access Family</h3>
              <p className="mt-2 text-sm text-gray-400">
                Everything in All Access, plus a shared household for the whole
                family — multiple members, shared assets, receipts, warranties,
                documents, and emergency info.
              </p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold">
                  {billing === "monthly" ? "$24.99" : "$249.99"}
                </span>
                <span className="text-sm text-gray-400">
                  {billing === "monthly" ? "/month" : "/year"}
                </span>
              </div>

              <a
                href={ALL_ACCESS_CHECKOUT_URLS[
                  billing === "monthly" ? "BUNDLE_FAMILY_MONTHLY" : "BUNDLE_FAMILY_ANNUAL"
                ]}
                className="mt-6 inline-flex justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500"
              >
                Get All Access Family
              </a>

              <ul className="mt-7 space-y-3">
                {[
                  "Everything in All Access",
                  "Shared household storage",
                  "Multiple family members",
                  "Shared assets, receipts & warranties",
                  "Shared documents & emergency info",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Prefer to buy individually? Pick an add-on module below — each one
            attaches to your DocSnap plan.
          </p>
        </div>
      </section>

      {/* VeraKeep add-on modules */}
      <section className="border-t border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Add-ons inside DocSnap
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-gray-400">
            DocSnap is your one place for the documents that matter. Snap these
            paid add-on modules right onto your DocSnap account — each one is a
            capability for the things you own, not a separate product.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div
                key={m.name}
                className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 transition hover:border-gray-700"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-900/40 text-2xl">
                  {m.emoji}
                </div>
                <h3 className="mt-4 text-lg font-bold">{m.name}</h3>
                <p className="mt-1 text-sm font-medium text-indigo-300">{m.tagline}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    {billing === "monthly" ? m.priceMonthly : m.priceAnnual}
                  </span>
                  <span className="text-sm text-gray-400">
                    {billing === "monthly" ? "/month" : "/year"}
                  </span>
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-300">{m.description}</p>

                <div className="mt-6 flex flex-col gap-2">
                  {m.comingSoon ? (
                    <span className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-400">
                      Coming soon
                    </span>
                  ) : m.checkout[billing] ? (
                    <>
                      <a
                        href={m.checkout[billing]}
                        className="inline-flex justify-center rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                      >
                        Buy
                      </a>
                      <Link
                        to={m.route}
                        className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
                      >
                        Open {m.name}
                      </Link>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-400">
                        Pricing coming soon
                      </span>
                      <Link
                        to={m.route}
                        className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
                      >
                        Open {m.name}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <MeetingSnapTiers billing={billing} />
        </div>
      </section>

      <section className="border-t border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="mt-10 space-y-8">
            <div>
              <h3 className="font-semibold">Can I cancel anytime?</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Yes — cancel any paid plan from your Stripe billing portal. Features remain active until the end of your
                billing period.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What happens if I downgrade?</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Your documents remain safe. Free accounts can scan locally and keep basic storage; paid cloud storage
                access ends according to your plan.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Do I need a credit card to scan?</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                No. Scanning and local PDF downloads are free. A card is only needed for a paid plan with cloud storage
                and additional organization tools.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What's the difference between Personal and Family?</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Personal is a single-user plan with unlimited cloud storage and the full DocSnap toolset. Family adds
                shared household storage and lets multiple users organize family documents together.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        {[
          ["/privacy", "Privacy"],
          ["/terms", "Terms"],
          ["/contact", "Contact"],
          ["/faq", "FAQ"],
          ["/changelog", "Changelog"],
          ["/about", "About"],
          ["/pricing", "Pricing"],
        ].map(([to, label]) => (
          <Link key={to} to={to as "/pricing"} className="hover:text-indigo-400">
            {label}
          </Link>
        ))}
      </footer>
    </main>
  );
}
