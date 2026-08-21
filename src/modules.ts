import { MODULE_CHECKOUT_URLS } from "./moduleCheckout";

/**
 * VeraKeep modules that attach to DocSnap. Shared by the landing page and
 * the pricing page so the marketing copy stays consistent in one place.
 */
interface ModuleBase {
  name: string;
  emoji: string;
  tagline: string;
  description: string;
}

/** A module that is available to buy and open today. */
interface LiveModule extends ModuleBase {
  comingSoon?: false;
  /** App route the module lives at. */
  route: "/meetingsnap" | "/garage" | "/receipts";
  /** Display price for monthly/annual billing. */
  priceMonthly: string;
  priceAnnual: string;
  /** Checkout slots (from moduleCheckout.ts) keyed by billing cadence. */
  checkout: { monthly: string; annual: string };
}

/** A module announced ahead of launch — no route, price, or checkout yet. */
interface ComingSoonModule extends ModuleBase {
  comingSoon: true;
  route?: never;
  priceMonthly?: never;
  priceAnnual?: never;
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
    emoji: "📄",
    tagline: "Every bill and subscription, tracked",
    description:
      "Organize bills, subscriptions, and payment schedules in one place — so nothing slips through the cracks.",
    comingSoon: true,
  },
  {
    name: "ContractSnap",
    emoji: "✍️",
    tagline: "Key contract terms at a glance",
    description:
      "Extract and remember the important terms from contracts and agreements — renewals, deadlines, and obligations.",
    comingSoon: true,
  },
  {
    name: "HomeSnap",
    emoji: "🏠",
    tagline: "Everything for your home, in one place",
    description:
      "Home inventory, appliance manuals and warranties, and maintenance schedules — all attached to what you own.",
    comingSoon: true,
  },
];
