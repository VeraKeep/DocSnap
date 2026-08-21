import { MODULE_CHECKOUT_URLS } from "./moduleCheckout";

/**
 * VeraKeep modules that attach to DocSnap. Shared by the landing page and
 * the pricing page so the marketing copy stays consistent in one place.
 */
export interface Module {
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  /** App route the module lives at. */
  route: "/meetingsnap" | "/garage" | "/receipts" | "/bills";
  /** Display price for monthly/annual billing. */
  priceMonthly: string;
  priceAnnual: string;
  /** Checkout slots (from moduleCheckout.ts) keyed by billing cadence. */
  checkout: { monthly: string; annual: string };
}

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
];
