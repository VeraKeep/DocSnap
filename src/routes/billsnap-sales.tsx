import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/** /billsnap-sales — public sales/landing page for BillSnap. */
export const Route = createFileRoute("/billsnap-sales")({
  head: () => ({
    meta: [
      { title: "BillSnap — DocSnap" },
      {
        name: "description",
        content:
          "Snap the bill, know what you owe and when. BillSnap — a paid add-on inside DocSnap — tracks vendors, due dates, and amounts so you never miss a bill.",
      },
    ],
  }),
  component: BillSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "BillSnap",
  logo: "🧾",
  metaTitle: "BillSnap — DocSnap",
  metaDescription:
    "Snap the bill, know what you owe and when. BillSnap — a paid add-on inside DocSnap — tracks vendors, due dates, and amounts so you never miss a bill.",
  eyebrow: "BillSnap",
  headline: "Snap the bill, know what you owe and when.",
  subhead:
    "Capture each bill the moment it arrives, and BillSnap tracks the vendor, the amount, and the due date — so you always know what's coming and when it's due. No more late fees, no more digging for the statement.",
  ctaPrimary: "Start your bill record",
  ctaPrimaryPrice: "$2.99/month",
  ctaSecondary: "or $29.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.BILLSNAP_MONTHLY,
  primaryButton: "Get BillSnap — $2.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.BILLSNAP_ANNUAL,
  yearlyButton: "Get BillSnap — $29.99/year",
  monthlyPrice: "$2.99",
  yearlyPrice: "$29.99",
  yearlyBadge: "two months free",
  yearlyApx: "≈ $2.50/mo",
  monthlyBlurb: "Good for trying it out",
  yearlyBlurb: "Keeping every bill on record for the long haul",
  cardLine: "Full BillSnap access",
  benefitsHeading: "Why keep a bill record at all?",
  benefits: [
    {
      title: "Know what you owe, before it's due",
      body: "It's easy to lose track of due dates across utilities, subscriptions, and statements. BillSnap captures each bill and surfaces the vendor, amount, and due date — so you know what's coming up and can plan for it.",
    },
    {
      title: "Never get caught by late fees or surprises",
      body: "When a bill arrives, snap it and it's on record. The amount you owe, the vendor, and when it's due are all tracked, so nothing sneaks up on you.",
    },
    {
      title: "Keep every statement searchable",
      body: "Store your bills alongside their key details. Months or years later, you can still find what you owed, to whom, and when — without hunting through emails and paperwork.",
    },
  ],
  featuresHeading: "What you can do",
  features: [
    "Snap a bill and capture the vendor, amount, and due date — on your phone or laptop.",
    "Know what you owe and when, with due dates and amounts all in one view.",
    "Keep a searchable history of every bill, by vendor, date, or amount.",
    "Organise bills in one place, alongside your other DocSnap documents and receipts.",
    "Rely on it for years — a running record of what you've paid and when.",
  ],
  startNoteTitle: "Not sure where to start?",
  startNoteBody:
    "Add the bill that's due soonest, or the one you've had trouble keeping track of. You can add the rest over time; your bill record grows with every statement.",
};

function BillSnapSalesPage() {
  return <ModuleSalesPage {...CONFIG} />;
}
