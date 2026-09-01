/**
 * Post-purchase success banner — ONE implementation reused across every
 * Stripe redirect destination (the account/profile route and each of the
 * seven module routes).
 *
 * STRIPE REDIRECT HANDLING (owner decision: Payment Link redirect URLs can
 * return to the app with `?checkout=success`).
 *
 * Entitlement truth comes ONLY from the webhook + DB. The `?checkout=success`
 * flag is DISPLAY-ONLY: it merely asks "should I look for a fresh grant?".
 * This component never grants or alters anything from the URL — it reads the
 * user's ACTUAL entitlements server-side (getUserEntitlementSummary, which
 * queries the rows the Stripe webhook already wrote) and renders only what
 * the DB says the user owns.
 *
 * Behaviour by case:
 *  - Activated  : flag present + signed-in + DB confirms the relevant
 *                  plan/module → "Subscription activated" banner with the
 *                  plan/module name, a next-step line, and a CTA.
 *  - Not-entitled: flag present + signed-in but the DB does NOT confirm the
 *                  entitlement → render nothing (the route's normal
 *                  locked/upgrade experience stays in place). No banner.
 *  - Signed-out  : flag present but no signed-in user → render nothing
 *                  (fail closed; the auth gate below handles the page).
 *  - Webhook race: flag present + signed-in + entitlements still resolving
 *                  (webhook hasn't landed yet) → lightweight
 *                  "Confirming your subscription…" state that resolves on the
 *                  next check / refresh — still never granting from the URL.
 */

import { Link, useLocation } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-start";
import { useEffect, useState } from "react";
import {
  getUserEntitlementSummary,
  type EntitlementSummary,
} from "~/subscription";

/** The eight paid thing-a-user-can-buy keyed for lookup inside the banner. */
export type CheckoutDestinationModule =
  | "receiptsnap"
  | "garagesnap"
  | "billsnap"
  | "meetingsnap"
  | "homesnap"
  | "contractsnap"
  | "booksnap";

interface ModuleMeta {
  name: string;
  emoji: string;
  nextStep: string;
  ctaTo: string;
  ctaLabel: string;
}

/** Per-module copy for the success banner. The CTA points at the module's
 *  main workspace (its route), which is the module's primary use / scan page. */
const MODULE_META: Record<CheckoutDestinationModule, ModuleMeta> = {
  receiptsnap: {
    name: "ReceiptSnap",
    emoji: "🧾",
    nextStep: "Scan your first receipt and keep it searchable forever.",
    ctaTo: "/receipts",
    ctaLabel: "Open your receipts",
  },
  garagesnap: {
    name: "GarageSnap",
    emoji: "🔧",
    nextStep: "Add your tools and equipment to start your inventory.",
    ctaTo: "/garage",
    ctaLabel: "Open your garage",
  },
  billsnap: {
    name: "BillSnap",
    emoji: "🧾",
    nextStep: "Snap a bill and know what you owe and when.",
    ctaTo: "/bills",
    ctaLabel: "Open your bills",
  },
  meetingsnap: {
    name: "MeetingSnap",
    emoji: "🎙️",
    nextStep: "Upload a transcript and get summaries, decisions, and actions.",
    ctaTo: "/meetingsnap",
    ctaLabel: "Open your meetings",
  },
  homesnap: {
    name: "HomeSnap",
    emoji: "🏡",
    nextStep: "Add your home and its systems to keep them permanently on record.",
    ctaTo: "/homesnap",
    ctaLabel: "Open your home",
  },
  contractsnap: {
    name: "ContractSnap",
    emoji: "✍️",
    nextStep: "Upload a contract to keep its key terms at a glance.",
    ctaTo: "/contracts",
    ctaLabel: "Open your contracts",
  },
  booksnap: {
    name: "BookSnap",
    emoji: "📚",
    nextStep: "Add your first book and start your shelf.",
    ctaTo: "/books",
    ctaLabel: "Open your library",
  },
};

/** Lookup for whether the signed-in user owns a given module (from the DB
 *  summary; MeetingSnap is its own independent tier model). */
function ownsModule(
  module: CheckoutDestinationModule,
  summary: EntitlementSummary,
): boolean {
  switch (module) {
    case "meetingsnap":
      return summary.meetingsnap !== "free";
    case "receiptsnap":
      return summary.receiptsnap;
    case "garagesnap":
      return summary.garagesnap;
    case "billsnap":
      return summary.billsnap;
    case "contractsnap":
      return summary.contractsnap;
    case "homesnap":
      return summary.homesnap;
    case "booksnap":
      return summary.booksnap;
  }
}

interface RenderedContent {
  label: string;
  emoji: string;
  message: string;
  ctaTo: string;
  ctaLabel: string;
}

/** Resolve what to show on the account/profile destination from the DB
 *  summary: All Access → paid tier → first owned add-on → nothing. */
function resolveProfileContent(summary: EntitlementSummary): RenderedContent | null {
  if (summary.allAccess) {
    return {
      label: "VeraKeep All Access",
      emoji: "✨",
      message:
        "Your entire suite is active — your DocSnap plan plus all seven modules are unlocked for you.",
      ctaTo: "/scan",
      ctaLabel: "Start scanning",
    };
  }
  if (summary.tier === "personal") {
    return {
      label: "Personal",
      emoji: "🗂️",
      message: "Your DocSnap Personal plan is active — scan unlimited documents and keep them in the cloud.",
      ctaTo: "/scan",
      ctaLabel: "Start scanning",
    };
  }
  if (summary.tier === "family") {
    return {
      label: "Family",
      emoji: "🏠",
      message: "Your DocSnap Family plan is active — shared household storage for the whole family.",
      ctaTo: "/scan",
      ctaLabel: "Start scanning",
    };
  }
  // Only add-ons owned (no paid DocSnap tier): show the first one in a
  // stable order so a single add-on purchase surfaces its own confirmation.
  const owned = (
    [
      "receiptsnap",
      "garagesnap",
      "billsnap",
      "contractsnap",
      "homesnap",
      "booksnap",
      "meetingsnap",
    ] as CheckoutDestinationModule[]
  ).find((m) => ownsModule(m, summary));
  if (!owned) return null;
  const meta = MODULE_META[owned];
  return {
    label: meta.name,
    emoji: meta.emoji,
    message: meta.nextStep,
    ctaTo: meta.ctaTo,
    ctaLabel: meta.ctaLabel,
  };
}

/** Resolve the module-destination banner from the DB summary. Returns null
 *  (render nothing) unless the DB confirms the module is actually unlocked. */
function resolveModuleContent(
  module: CheckoutDestinationModule,
  summary: EntitlementSummary,
): RenderedContent | null {
  if (!ownsModule(module, summary)) return null;
  const meta = MODULE_META[module];
  const allAccessNote = summary.allAccess
    ? " Included in your VeraKeep All Access plan."
    : "";
  return {
    label: meta.name,
    emoji: meta.emoji,
    message: meta.nextStep + allAccessNote,
    ctaTo: meta.ctaTo,
    ctaLabel: meta.ctaLabel,
  };
}

/** Lightweight webhook-race state: shown while the entitlement summary is
 *  still resolving after a `?checkout=success` return. Never grants anything —
 *  it just resolves on the next check / refresh. */
function ConfirmingBanner() {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-300">Confirming your subscription…</p>
      </div>
    </div>
  );
}

/** The confirmed success banner once DB entitlements back it up. */
function SuccessBanner({
  content,
  onDismiss,
}: {
  content: RenderedContent;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-indigo-700/60 bg-indigo-950/40 p-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-indigo-100">
            Subscription activated 🎉
          </p>
          <p className="mt-1 text-sm text-indigo-200/80">
            <span className="font-semibold text-white">
              {content.emoji} {content.label}
            </span>{" "}
            — {content.message}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to={content.ctaTo}
            className="inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            {content.ctaLabel}
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-indigo-300/70 transition hover:text-indigo-100"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reusable post-purchase confirmation banner. Mount it on any Stripe
 *  redirect destination with the matching `destination` prop. */
export function CheckoutSuccessBanner({
  destination,
}: {
  destination:
    | { kind: "profile" }
    | { kind: "module"; module: CheckoutDestinationModule };
}) {
  const { user, isLoaded } = useUser();
  const location = useLocation();
  // Read the display-only flag from the raw URL so route search typing (and
  // existing <Link to=...> usages) are left untouched by this feature.
  const showedPurchase =
    new URLSearchParams(location.searchStr ?? "").get("checkout") === "success";
  const [summary, setSummary] = useState<EntitlementSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!showedPurchase) return;
    let cancelled = false;
    // Webhook-first: read the ACTUAL DB entitlements. Never grant from the URL.
    getUserEntitlementSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        // Signed-out / error → fail closed: summary stays null, no success UI.
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showedPurchase]);

  // No flag → nothing.
  if (!showedPurchase) return null;
  // Fail closed: not signed in, or Clerk not loaded yet → no success banner;
  // the route's own auth gate handles the page.
  if (!isLoaded || !user) return null;
  // Webhook race: the granted summary is still resolving → lightweight
  // confirming state (never grants from the URL).
  if (!summary) return <ConfirmingBanner />;
  if (dismissed) return null;

  const content =
    destination.kind === "profile"
      ? resolveProfileContent(summary)
      : resolveModuleContent(destination.module, summary);

  // Not entitled → render nothing; the route's normal locked/upgrade
  // experience stays visible below.
  if (!content) return null;
  return <SuccessBanner content={content} onDismiss={() => setDismissed(true)} />;
}
