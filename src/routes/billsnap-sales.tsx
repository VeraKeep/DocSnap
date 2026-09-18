import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import { canonicalUrl } from "~/siteConfig";

export const Route = createFileRoute("/billsnap-sales")({
  head: () => ({
    meta: [
      { title: "Bill Organizer & Due Date Tracker | BillSnap by DocSnap" },
      { name: "description", content: "Capture bills, organize vendors, amounts and due dates, and keep a searchable bill record with BillSnap by DocSnap." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/billsnap-sales") }],
  }),
  component: BillSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "BillSnap", logo: "🧾",
  metaTitle: "Bill Organizer & Due Date Tracker | BillSnap by DocSnap",
  metaDescription: "Capture bills, organize vendors, amounts and due dates, and keep a searchable bill record with BillSnap by DocSnap.",
  eyebrow: "BillSnap", headline: "Snap the bill. Know what you owe and when.",
  subhead: "Capture a bill when it arrives and keep the vendor, amount, due date, payment status, and reminder lead together in one searchable record.",
  ctaPrimary: "Start your bill record", ctaPrimaryPrice: "$2.99/month", ctaSecondary: "or $29.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.BILLSNAP_MONTHLY, primaryButton: "Get BillSnap — $2.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.BILLSNAP_ANNUAL, yearlyButton: "Get BillSnap — $29.99/year",
  monthlyPrice: "$2.99", yearlyPrice: "$29.99", yearlyBadge: "two months free", yearlyApx: "≈ $2.50/mo",
  monthlyBlurb: "Good for trying it out", yearlyBlurb: "Keeping your bills organized for the long haul", cardLine: "Full BillSnap access",
  benefitsHeading: "Why keep a bill record?",
  benefits: [
    { title: "See what is due", body: "Keep vendor, amount, due date, payment status, and reminder timing together so the next bill is easier to act on." },
    { title: "Keep statement details searchable", body: "Build a structured history instead of relying on a pile of paper statements or scattered downloads." },
    { title: "Review the details that matter", body: "BillSnap keeps extracted bill details editable so you can confirm the record before relying on it." },
  ],
  featuresHeading: "What you can do",
  features: [
    "Capture vendor, due date, amount due, billing period, category, and payment status.",
    "Track Upcoming, Due Soon, Overdue, Paid, and Archived bills.",
    "Record whether autopay was detected and choose a reminder lead for due dates.",
    "Keep account references masked in the interface while retaining the bill record.",
    "Build a structured bill history alongside your other DocSnap records.",
  ],
  startNoteTitle: "Not sure where to start?", startNoteBody: "Add the bill due soonest. Once the current month is organized, backfill the recurring bills you want to keep on record.",
  resourceLinks: [
    { href: "/resources/how-to-organize-scanned-documents", label: "How to organize scanned documents" },
    { href: "/resources/local-vs-cloud-document-scanning", label: "Local vs. cloud document scanning" },
    { href: "/resources/mobile-scanner-privacy", label: "Mobile scanner privacy" },
  ],
};
function BillSnapSalesPage() { return <ModuleSalesPage {...CONFIG} />; }
