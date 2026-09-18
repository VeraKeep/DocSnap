import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import { canonicalUrl } from "~/siteConfig";

export const Route = createFileRoute("/garagesnap-sales")({
  head: () => ({
    meta: [
      { title: "Tool & Equipment Inventory | GarageSnap by DocSnap" },
      { name: "description", content: "Inventory tools and equipment with photos, serial numbers, purchase details, warranties and storage locations using GarageSnap by DocSnap." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/garagesnap-sales") }],
  }),
  component: GarageSnapSalesPage,
});
const CONFIG: ModuleSalesConfig = {
  moduleName: "GarageSnap", logo: "🔧", metaTitle: "Tool & Equipment Inventory | GarageSnap by DocSnap",
  metaDescription: "Inventory tools and equipment with photos, serial numbers, purchase details, warranties and storage locations using GarageSnap by DocSnap.",
  eyebrow: "GarageSnap", headline: "Your tools and equipment, inventoried and on record.",
  subhead: "Build a searchable workshop inventory with photos, make, model, serial number, purchase details, warranty expiration, and storage location for each item.",
  ctaPrimary: "Start your garage inventory", ctaPrimaryPrice: "$2.99/month", ctaSecondary: "or $29.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.GARAGESNAP_MONTHLY, primaryButton: "Get GarageSnap — $2.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.GARAGESNAP_ANNUAL, yearlyButton: "Get GarageSnap — $29.99/year",
  monthlyPrice: "$2.99", yearlyPrice: "$29.99", yearlyBadge: "two months free", yearlyApx: "≈ $2.50/mo",
  monthlyBlurb: "Good for trying it out", yearlyBlurb: "Keeping your garage inventory for the long haul", cardLine: "Full GarageSnap access",
  benefitsHeading: "Why keep a garage inventory?",
  benefits: [
    { title: "Know what you own", body: "Keep tools and equipment in a structured inventory instead of relying on memory." },
    { title: "Keep identifying details together", body: "Make, model, serial number, photo, purchase information, and storage location stay with the item record." },
    { title: "See warranty status quickly", body: "Warranty expiration dates make it easier to see whether an item is still covered." },
  ],
  featuresHeading: "What you can do",
  features: [
    "Inventory tools and equipment with photos, make, model, serial number, and condition-related records.",
    "Record purchase date, purchase price, warranty expiration, and storage location.",
    "Organize items by power tool, hand tool, equipment, supply, or other.",
    "See active versus expired warranty status from the recorded expiration date.",
    "Keep your garage inventory alongside the rest of your DocSnap records.",
  ],
  startNoteTitle: "Not sure where to start?", startNoteBody: "Start with your highest-value tools or anything still under warranty, then fill in the rest of the garage over time.",
  resourceLinks: [
    { href: "/resources/home-warranty-document-organization", label: "Organize warranties and home records" },
    { href: "/resources/how-to-organize-scanned-documents", label: "How to organize scanned documents" },
    { href: "/resources/how-to-digitize-filing-cabinet", label: "Digitize a filing cabinet" },
  ],
};
function GarageSnapSalesPage() { return <ModuleSalesPage {...CONFIG} />; }
