import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/** /garagesnap-sales — public sales/landing page for GarageSnap. */
export const Route = createFileRoute("/garagesnap-sales")({
  head: () => ({
    meta: [
      { title: "GarageSnap — DocSnap" },
      {
        name: "description",
        content:
          "GarageSnap — a paid add-on inside DocSnap. Inventory your tools and equipment with warranties and maintenance tracking, and know what you own, what's covered, and what's due.",
      },
    ],
  }),
  component: GarageSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "GarageSnap",
  logo: "🔧",
  metaTitle: "GarageSnap — DocSnap",
  metaDescription:
    "GarageSnap — a paid add-on inside DocSnap. Inventory your tools and equipment with warranties and maintenance tracking, and know what you own, what's covered, and what's due.",
  eyebrow: "GarageSnap",
  headline: "Your tools and equipment, inventoried and on record.",
  subhead:
    "Know every tool you own, what it's covered by, and when it needs maintenance. GarageSnap turns your workshop into a searchable inventory — with warranties, manuals, and maintenance schedules attached to each tool.",
  ctaPrimary: "Start your garage inventory",
  ctaPrimaryPrice: "$2.99/month",
  ctaSecondary: "or $29.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.GARAGESNAP_MONTHLY,
  primaryButton: "Get GarageSnap — $2.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.GARAGESNAP_ANNUAL,
  yearlyButton: "Get GarageSnap — $29.99/year",
  monthlyPrice: "$2.99",
  yearlyPrice: "$29.99",
  yearlyBadge: "two months free",
  yearlyApx: "≈ $2.50/mo",
  monthlyBlurb: "Good for trying it out",
  yearlyBlurb: "Keeping your garage on record for the long haul",
  cardLine: "Full GarageSnap access",
  benefitsHeading: "Why keep a garage inventory at all?",
  benefits: [
    {
      title: "Stop buying tools you already own",
      body: "It's easy to lose track of what's in the garage — until you've bought the same wrench twice. GarageSnap keeps every tool and piece of equipment inventoried with photos, make, model, and location, so a quick search tells you what you actually have.",
    },
    {
      title: "Know what's covered and when it runs out",
      body: "Warranties and receipts matter when a tool fails. GarageSnap keeps them attached to the right tool, so you know what's still covered and how long you have to file.",
    },
    {
      title: "Never skip a maintenance date again",
      body: "Blades, batteries, filters, and annual maintenance all have schedules. GarageSnap tells you what's due and what's coming up, and marks the next date when you log it done.",
    },
  ],
  featuresHeading: "What you can do",
  features: [
    "Inventory every tool and piece of equipment — photos, make, model, serial, storage location, and condition.",
    "Attach warranties and receipts to each item, so claims start from the right record.",
    "Track maintenance with recurring schedules — what's due and what's coming up.",
    "Search your whole garage by tool, brand, or location — find any item in seconds.",
    "Keep it all in one place alongside your other DocSnap documents and records.",
  ],
  startNoteTitle: "Not sure where to start?",
  startNoteBody:
    "Add the tools you reach for most, or the ones with warranties still active. You can fill in the rest over time; your inventory grows with your garage.",
};

function GarageSnapSalesPage() {
  return <ModuleSalesPage {...CONFIG} />;
}
