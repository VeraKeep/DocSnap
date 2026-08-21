import { MODULE_CHECKOUT_URLS } from "./moduleCheckout";

/**
 * VeraKeep modules that attach to DocSnap. Shared by the landing page and
 * the pricing page so the marketing copy stays consistent in one place.
 *
 * Modules are a discriminated union so the card renderers can branch cleanly:
 * - LiveModule: has an app route + a price; buyable once a Stripe URL exists.
 *   When the checkout URL is still empty (pricing/Stripe pending) the Buy
 *   button renders as an inert "Pricing coming soon" state while the "Open"
 *   app link still works.
 * - ComingSoonModule: announced ahead of launch — planned price shown, but
 *   no app route and no Buy/Open actions yet.
 */
interface ModuleBase {
  name: string;
  emoji: string;
  tagline: string;
  description: string;
}

/** A module with a live app route and a price; buyable once a Stripe URL exists. */
interface LiveModule extends ModuleBase {
  comingSoon?: false;
  /** App route the module lives at. */
  route: "/meetingsnap" | "/garage" | "/receipts" | "/bills" | "/homesnap";
  /** Display price for monthly/annual billing. */
  priceMonthly: string;
  priceAnnual: string;
  /** Checkout slots (from moduleCheckout.ts) keyed by billing cadence. */
  checkout: { monthly: string; annual: string };
}

/** A module announced ahead of launch — planned price shown, no route yet. */
interface ComingSoonModule extends ModuleBase {
  comingSoon: true;
  route?: never;
  priceMonthly: string;
  priceAnnual: string;
  checkout?: never;
}

export type Module = LiveModule | ComingSoonModule;

export const MODULES: Module[] = [
  {
    name: "MeetingSnap",
    emoji: "🎙️",
    tagline: "Turn conversations into action",
    description:
      "Upload a meeting transcript and get AI-powered summaries, decisions, and follow-up actions — so you never lose a next step.",
    route: "/meetingsnap",
    priceMonthly: "$5.99",
    priceAnnual: "$59.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.MEETINGSNAP_PERSONAL_ANNUAL,
    },
  },
  {
    name: "GarageSnap",
    emoji: "🔧",
    tagline: "Everything in your workshop, tracked",
    description:
      "Inventory your tools and equipment with photos, make/model and serial numbers, warranties, and maintenance reminders.",
    route: "/garage",
    priceMonthly: "$2.99",
    priceAnnual: "$29.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.GARAGESNAP_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.GARAGESNAP_ANNUAL,
    },
  },
  {
    name: "ReceiptSnap",
    emoji: "🧾",
    tagline: "Every receipt, searchable forever",
    description:
      "Capture receipts, auto-extract merchant, date, and amount, and track product IDs, warranties, and return windows.",
    route: "/receipts",
    priceMonthly: "$2.99",
    priceAnnual: "$29.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.RECEIPTSNAP_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.RECEIPTSNAP_ANNUAL,
    },
  },
  {
    name: "BillSnap",
    emoji: "🧾",
    tagline: "Snap the bill, know what you owe and when",
    description:
      "Turn bill photos and PDFs into structured records — vendor, amount due, due date, payment status, reminders, and automatic charge-change detection.",
    route: "/bills",
    priceMonthly: "$2.99",
    priceAnnual: "$29.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.BILLSNAP_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.BILLSNAP_ANNUAL,
    },
  },
  {
    name: "HomeSnap",
    emoji: "🏡",
    tagline: "Your home, permanently on record",
    description:
      "Track every system, appliance, fixture, and improvement in your home — warranties, receipts, manuals, and repair history, organized by the things in your home.",
    route: "/homesnap",
    // PAID ADD-ON (owner decision, business-plan rev 2): $3.99/mo or $39.99/yr,
    // gated by an addon_homesnap flag on the user, mirroring ReceiptSnap/GarageSnap.
    // Checkout URLs are populated in moduleCheckout.ts; until the real Stripe
    // payment links are inserted the Buy/upgrade buttons stay inert (no fabricated
    // URL). The module ships phase-1 auth-gated (any signed-in user can use it);
    // the hard add-on gate lands in phase 3.
    priceMonthly: "$3.99",
    priceAnnual: "$39.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.HOMESNAP_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.HOMESNAP_ANNUAL,
    },
  },
  {
    name: "ContractSnap",
    emoji: "✍️",
    tagline: "Key contract terms at a glance",
    description:
      "Extract and remember the important terms from contracts and agreements — renewals, deadlines, and obligations.",
    route: "/contracts",
    // PAID ADD-ON (owner decision, business-plan rev 3): $4.99/mo or $49.99/yr.
    // /contracts is HARD-GATED behind the addon_contractsnap flag (phase 3,
    // fails closed — see features/contractsnap/server.ts requireContractSnapAddon
    // and subscription.ts hasContractSnapAddon). A DocSnap tier does NOT unlock
    // it. The Buy button below routes to the real ContractSnap Stripe checkout.
    priceMonthly: "$4.99",
    priceAnnual: "$49.99",
    checkout: {
      monthly: MODULE_CHECKOUT_URLS.CONTRACTSNAP_MONTHLY,
      annual: MODULE_CHECKOUT_URLS.CONTRACTSNAP_ANNUAL,
    },
  },
];
