import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MODULE_CHECKOUT_URLS } from "../moduleCheckout";

type BillingCadence = "monthly" | "annual";

interface Tier {
  name: string;
  price: { monthly: string; annual: string };
  cadence: { monthly: string; annual: string };
  description: string;
  badge?: string;
  /** Buy link for the given cadence; absent for Free/Team. */
  href?: { monthly: string; annual: string };
  comingSoon?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: { monthly: "$0", annual: "$0" },
    cadence: { monthly: "/month", annual: "/month" },
    description: "2 meetings a month, free forever.",
  },
  {
    name: "Personal",
    price: { monthly: "$5.99", annual: "$59.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "Every meeting fully captured.",
    badge: "Most Popular",
    href: {
      monthly: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_ANNUAL,
    },
  },
  {
    name: "Pro",
    price: { monthly: "$14.99", annual: "$149.99" },
    cadence: { monthly: "/month", annual: "/year" },
    description: "Power users running back-to-back meetings.",
    href: {
      monthly: MODULE_CHECKOUT_URLS.MEETINGSNAP_PRO_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.MEETINGSNAP_PRO_ANNUAL,
    },
  },
  {
    name: "Team",
    price: { monthly: "$8", annual: "$8" },
    cadence: { monthly: "/user/month", annual: "/user/month" },
    description: "Collaborate across your whole team.",
    comingSoon: true,
  },
];

/**
 * Compact MeetingSnap tiers panel, shown INSIDE the DocSnap add-on area — so
 * MeetingSnap reads as the one premium, tiered add-on inside DocSnap rather
 * than a standalone product with its own pricing page.
 */
export function MeetingSnapTiers({ billing }: { billing?: BillingCadence }) {
  const [localBilling, setLocalBilling] = useState<BillingCadence>("monthly");
  const cadence = billing ?? localBilling;
  return (
    <div className="mt-10 rounded-3xl border border-gray-800 bg-gray-900/40 p-6 sm:p-8">
      <div className="text-center">
        <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
          🎙️ MeetingSnap — the premium add-on
        </h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          The one tiered add-on inside DocSnap. Turn every conversation into
          action with AI summaries, decisions, and next steps — pick a tier to
          add it to your DocSnap plan.
        </p>
      </div>

      {!billing && (
        <div className="mt-5 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900/60 p-1">
            {(["monthly", "annual"] as BillingCadence[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setLocalBilling(c)}
                className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors ${
                  cadence === c ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-5 ${
              tier.badge
                ? "border-indigo-500/60 bg-indigo-950/30"
                : "border-gray-800 bg-gray-900/60"
            }`}
          >
            {tier.badge && (
              <span className="absolute -top-3 left-4 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold">
                {tier.badge}
              </span>
            )}
            <h4 className="text-base font-bold">{tier.name}</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold">{tier.price[cadence]}</span>
              <span className="text-xs text-gray-400">{tier.cadence[cadence]}</span>
            </div>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-400">{tier.description}</p>
            <div className="mt-4">
              {tier.comingSoon ? (
                <span className="inline-flex w-full justify-center rounded-full border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-400">
                  Coming soon
                </span>
              ) : tier.href ? (
                <a
                  href={tier.href[cadence]}
                  className="inline-flex w-full justify-center rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  Add MeetingSnap · {tier.price[cadence]}
                </a>
              ) : (
                <Link
                  to="/meetingsnap"
                  className="inline-flex w-full justify-center rounded-full border border-indigo-500 bg-indigo-600/20 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-600/40"
                >
                  Start free
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
