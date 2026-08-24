/**
 * HomeSnapLaunchBanner — a dismissible in-app launch announcement for the
 * HomeSnap add-on, rendered at the top of the DocSnap add-ons ("One place for
 * everything you own") section.
 *
 * Copy source of truth: /home/team/shared/marketing/launch/launch-note.md
 *   - Headline: "Your home finally has a home in DocSnap."
 *   - Opening line (condensed from the launch note's opening paragraph).
 *   - Two CTAs: /homesnap-sales (the sales/landing page) and /homesnap-demo
 *     (the 30-second static demo) — both existing routes from the conversion
 *     work.
 *   - Pricing line reuses the module card's exact wording for the live
 *     checkout ($3.99/month or $39.99/year, two months free on yearly).
 *
 * Purely presentational: no gating, no checkout links, no entitlement changes.
 * Dismissal is remembered per browser via localStorage.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";

const DISMISS_KEY = "homesnap-launch-banner-dismissed";

export function HomeSnapLaunchBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — still hide for this session */
    }
    setDismissed(true);
  };

  return (
    <div className="relative mb-12 overflow-hidden rounded-2xl border border-indigo-700/40 bg-gradient-to-br from-indigo-950/50 via-gray-900/70 to-gray-950/50 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            New in DocSnap
          </p>
          <h3 className="mt-1 text-xl font-bold sm:text-2xl">
            Your home finally has a home in DocSnap.
          </h3>
          <p className="mt-3 max-w-3xl leading-relaxed text-gray-300">
            You already snap your receipts with DocSnap… now give your home a
            permanent record of its own — organized around the objects you own.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Available now —{" "}
            <span className="font-semibold text-gray-200">$3.99/month</span> or{" "}
            <span className="font-semibold text-gray-200">$39.99/year</span>{" "}
            <span className="text-gray-500">(two months free on yearly)</span>. Unlocks
            instantly inside your existing account — cancel anytime.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to="/homesnap-sales"
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              See what HomeSnap does →
            </Link>
            <Link
              to="/homesnap-demo"
              className="inline-flex items-center justify-center rounded-full border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-indigo-500 hover:text-white"
            >
              Take a 30-second tour
            </Link>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 rounded-full p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
