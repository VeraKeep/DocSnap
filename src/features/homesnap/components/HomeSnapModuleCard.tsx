/**
 * HomeSnapModuleCard — the reframed HomeSnap module card for the add-ons
 * screen (file 03-buy-path-module-card.md).
 *
 * Benefit-first headline/subline/bullets, a CTA that links to the LIVE Stripe
 * checkout (monthly primary, annual secondary — both existing wired URLs), a
 * "See a 30-second demo" helper link, and the pre-purchase microcopy placed
 * right beside/under the Buy button:
 *   - Primary microcopy: "What you'll do with it this week…"
 *   - Secondary microcopy ("Is this a lot of setup?…") as an info-hover tooltip
 *   - Tiny reassurance line: "Inside your DocSnap account · Cancel anytime."
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

const CARD_BODY_BULLETS = [
  "Stop re-paying for repairs — warranty dates and repair history saved per object.",
  "Never miss maintenance — filters, flush, batteries, and annual checks with next-due dates.",
  "Ready for the big moments — a clean, dated report for a sale or insurance claim.",
];

export function HomeSnapModuleCard({ compact = false }: { compact?: boolean }) {
  const [showSetupTip, setShowSetupTip] = useState(false);

  return (
    <div className="relative flex flex-col rounded-2xl border border-indigo-700/50 bg-gray-900/60 p-6 transition hover:border-indigo-500">
      {/* "Best value" hint + demo link */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs font-medium text-indigo-200">
          🏡 HomeSnap
        </span>
        <Link
          to="/homesnap-demo"
          className="text-xs text-indigo-300 transition hover:text-indigo-200"
        >
          See a 30-second demo of what this does →
        </Link>
      </div>

      <h3 className="mt-4 text-lg font-bold">Your home's permanent record</h3>
      <p className="mt-1 text-sm leading-relaxed text-gray-300">
        Know what you own, what it's worth, and what's covered — appliances, systems,
        warranties, repairs, and receipts, in one place.
      </p>

      {!compact && (
        <ul className="mt-4 space-y-2">
          {CARD_BODY_BULLETS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm leading-relaxed text-gray-400">
              <span className="mt-0.5 text-indigo-400">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-bold">$3.99</span>
        <span className="text-sm text-gray-400">/month</span>
        <span className="ml-2 text-sm text-gray-400">· or {` `} $39.99/yr</span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">(two months free on yearly)</p>

      {/* Buy buttons + microcopy (file 03 Section B) */}
      <div className="mt-5 flex flex-col gap-2">
        <a
          href={MODULE_CHECKOUT_URLS.HOMESNAP_MONTHLY}
          className="inline-flex justify-center rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Add HomeSnap — $3.99/mo
        </a>
        <a
          href={MODULE_CHECKOUT_URLS.HOMESNAP_ANNUAL}
          className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
        >
          or $39.99/yr · two months free
        </a>
        <Link
          to="/homesnap"
          search={{}}
          className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          Open HomeSnap
        </Link>
      </div>

      {/* Pre-purchase microcopy */}
      <div className="mt-5 space-y-3 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-100">What you'll do with it this week:</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">
            add the water heater or HVAC you already know about, and if you have a DocSnap
            receipt for it, HomeSnap fills in the details for you. Over time it becomes the
            record you reach for at every repair, sale, and warranty call.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Is this a lot of setup?</span>
          <span
            className="relative inline-flex cursor-help items-center"
            onMouseEnter={() => setShowSetupTip(true)}
            onMouseLeave={() => setShowSetupTip(false)}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full border border-gray-700 text-[10px] text-gray-400">
              i
            </span>
            {showSetupTip && (
              <span className="absolute bottom-6 left-0 z-10 w-64 rounded-lg border border-gray-700 bg-gray-900 p-3 text-left text-xs leading-relaxed text-gray-300 shadow-xl">
                No. Start with one object — even just your property. Add details when you have
                them; the record grows as your home does. You can add to it a little at a
                time, from anywhere.
              </span>
            )}
          </span>
        </div>

        <p className="text-xs text-gray-600">Inside your DocSnap account · Cancel anytime.</p>
      </div>
    </div>
  );
}
