import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/** /receiptsnap-sales — public sales/landing page for ReceiptSnap. */
export const Route = createFileRoute("/receiptsnap-sales")({
  head: () => ({
    meta: [
      { title: "ReceiptSnap — DocSnap" },
      {
        name: "description",
        content:
          "Every receipt, searchable forever. Capture and organize receipts with ReceiptSnap — a paid add-on inside DocSnap — and find any purchase in seconds.",
      },
    ],
  }),
  component: ReceiptSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "ReceiptSnap",
  logo: "🧾",
  metaTitle: "ReceiptSnap — DocSnap",
  metaDescription:
    "Every receipt, searchable forever. Capture and organize receipts with ReceiptSnap — a paid add-on inside DocSnap — and find any purchase in seconds.",
  eyebrow: "ReceiptSnap",
  headline: "Every receipt, searchable forever.",
  subhead:
    "Capture and organize every receipt the day you get it — then find any purchase, warranty, or return in seconds. No more shoebox, no more digging through email. ReceiptSnap keeps your receipts on record, ready when you need them.",
  ctaPrimary: "Start your receipt record",
  ctaPrimaryPrice: "$2.99/month",
  ctaSecondary: "or $29.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.RECEIPTSNAP_MONTHLY,
  primaryButton: "Get ReceiptSnap — $2.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.RECEIPTSNAP_ANNUAL,
  yearlyButton: "Get ReceiptSnap — $29.99/year",
  monthlyPrice: "$2.99",
  yearlyPrice: "$29.99",
  yearlyBadge: "two months free",
  yearlyApx: "≈ $2.50/mo",
  monthlyBlurb: "Good for trying it out",
  yearlyBlurb: "Keeping every receipt for the long haul",
  cardLine: "Full ReceiptSnap access",
  benefitsHeading: "Why keep a receipt record at all?",
  benefits: [
    {
      title: "Stop losing receipts the moment they leave your hands",
      body: "Paper fades, digital receipts vanish into inboxes, and warranty claims vanish with them. ReceiptSnap captures every receipt the day you get it — the store, the date, the items, the total — and keeps it searchable forever, so it's there the day you actually need it.",
    },
    {
      title: "Find any purchase in seconds",
      body: "Search by store, item, date, or amount. Need to know when you bought that tool for a return, or what you paid for the laptop for insurance? It's one search away, not a weekend of digging.",
    },
    {
      title: "Never miss a warranty again",
      body: "Receipts and warranties belong together. ReceiptSnap keeps them linked, so when a product fails you know you're covered and how long you have left to file.",
    },
  ],
  featuresHeading: "What you can do",
  features: [
    "Capture any receipt — snap a photo of a paper receipt or import one, on your phone or laptop.",
    "Search your whole receipt history by store, item, date, or amount — find any purchase in seconds.",
    "Keep warranties attached to their receipts, so returns and claims start from the right record.",
    "Organize receipts into categories and keep them all in one place, alongside your other DocSnap documents.",
    "Rely on it for years — a searchable record that grows with every purchase you add.",
  ],
  startNoteTitle: "Not sure where to start?",
  startNoteBody:
    "Add the receipts you have on hand today — your most recent purchases, or one you might need to return. You can backfill the rest over time; your receipt record grows with every purchase.",
};

function ReceiptSnapSalesPage() {
  return <ModuleSalesPage {...CONFIG} />;
}
