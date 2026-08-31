import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MODULE_CHECKOUT_URLS } from "../moduleCheckout";
import { CheckoutLink } from "../components/CheckoutLink";

type BillingCadence = "monthly" | "annual";

interface MeetingPlan {
  name: string;
  price: { monthly: string; annual: string };
  cadence: { monthly: string; annual: string };
  description: string;
  badge?: string;
  /** Checkout URL for the given cadence. Absent => no Buy link (Free/Team). */
  checkout?: { monthly?: string; annual?: string };
  button: "start" | "subscribe" | "coming-soon";
  features: string[];
}

const MEETING_PLANS: MeetingPlan[] = [
  {
    name: "Free",
    price: { monthly: "$0", annual: "$0" },
    cadence: { monthly: "/month", annual: "/month" },
    description: "2 meetings a month, free forever.",
    button: "start",
    features: [
      "2 meetings / month",
      "Basic AI summary",
      "Action items",
      "Decisions captured",
      "No card required",
    ],
  },
  {
    name: "Personal",
    price: { monthly: "$5.99", annual: "$59.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "For individuals who want every meeting fully captured.",
    badge: "Most Popular",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_ANNUAL,
    },
    button: "subscribe",
    features: [
      "10 meetings / month",
      "Full AI summaries",
      "Owners, deadlines & decisions",
      "Risks & follow-ups",
      "Follow-up email",
      "Search, history & exports",
    ],
  },
  {
    name: "Pro",
    price: { monthly: "$14.99", annual: "$149.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "Power users who run back-to-back meetings.",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.MEETINGSNAP_PRO_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.MEETINGSNAP_PRO_ANNUAL,
    },
    button: "subscribe",
    features: [
      "40 meetings / month",
      "Everything in Personal",
      "AI Q&A on your meetings",
      "Cross-meeting search",
      "Decision history",
      "Advanced exports",
      "Integrations",
      "Priority processing",
    ],
  },
  {
    name: "Team",
    price: { monthly: "$8", annual: "$8" },
    cadence: { monthly: "/user/month", annual: "/user/month" },
    description: "Collaborate across your whole team.",
    button: "coming-soon",
    features: [
      "Unlimited meetings",
      "Shared workspaces",
      "Assignments & permissions",
      "Org-wide search",
      "Admin & audit logs",
      "Minimum $40 / month",
    ],
  },
];

export const Route = createFileRoute("/meetingsnap-pricing")({
  head: () => ({
    meta: [
      { title: "MeetingSnap Pricing — VeraKeep © 2026" },
      {
        name: "description",
        content:
          "MeetingSnap turns conversations into action. Choose Free, Personal, Pro, or Team and get AI summaries, decisions, and next steps from every meeting.",
      },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/meetingsnap-pricing" }],
  }),
  component: MeetingSnapPricingPage,
});

function CheckIcon() {
  return <span className="shrink-0 text-green-400" aria-hidden="true">✓</span>;
}

function MeetingSnapPricingPage() {
  const [billing, setBilling] = useState<BillingCadence>("monthly");

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link to="/pricing" className="text-lg font-semibold hover:text-indigo-400">
          VeraKeep © 2026
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/meetingsnap" className="text-gray-400 hover:text-gray-200">
            Open the app →
          </Link>
          <Link to="/pricing" className="text-gray-400 hover:text-gray-200">
            DocSnap pricing
          </Link>
        </div>
      </header>

      <section className="px-4 pt-14 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl">
          🎙️
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/50 bg-indigo-900/40 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-300">
          The premium add-on inside DocSnap
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          MeetingSnap pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-400">
          Add MeetingSnap to your DocSnap plan to turn every conversation into
          action. MeetingSnap records nothing — just upload a transcript and get
          AI summaries, decisions, owners, and next steps in seconds.
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

      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 px-4 pb-16 pt-10 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
        {MEETING_PLANS.map((plan, index) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-6 ${
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

            {plan.button === "start" && (
              <Link
                to="/meetingsnap"
                className="mt-5 inline-flex justify-center rounded-full border border-indigo-500 bg-indigo-600/20 px-5 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-600/40"
              >
                Start free
              </Link>
            )}

            {plan.button === "subscribe" && (
              <CheckoutLink
                href={plan.checkout?.[billing] || "#"}
                className="mt-5 inline-flex justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500"
              >
                Subscribe
              </CheckoutLink>
            )}

            {plan.button === "coming-soon" && (
              <span className="mt-5 inline-flex justify-center rounded-full border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-400">
                Coming soon
              </span>
            )}

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

      <section className="border-t border-gray-800/50 px-4 py-10 text-center sm:px-6">
        <p className="text-sm text-gray-400">
          Want MeetingSnap plus DocSnap, ReceiptSnap, and GarageSnap in one plan?{" "}
          <Link to="/pricing" className="font-semibold text-indigo-300 hover:underline">
            Check out VeraKeep All Access →
          </Link>
        </p>
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        {[
          ["/pricing", "Pricing"],
          ["/meetingsnap", "Open the app"],
          ["/privacy", "Privacy"],
          ["/terms", "Terms"],
        ].map(([to, label]) => (
          <Link key={to} to={to as "/pricing"} className="hover:text-indigo-400">
            {label}
          </Link>
        ))}
      </footer>
    </main>
  );
}
