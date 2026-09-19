import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import { canonicalUrl } from "~/siteConfig";

export const Route = createFileRoute("/contractsnap-sales")({
  head: () => ({
    meta: [
      { title: "Contract Organizer & AI Summary | ContractSnap by DocSnap" },
      { name: "description", content: "Organize contracts and review AI-extracted dates, renewals, cancellation windows, obligations and plain-language summaries with ContractSnap." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/contractsnap-sales") }],
  }),
  component: ContractSnapSalesPage,
});
const CONFIG: ModuleSalesConfig = {
  moduleName: "ContractSnap", logo: "📄", metaTitle: "Contract Organizer & AI Summary | ContractSnap by DocSnap",
  metaDescription: "Organize contracts and review AI-extracted dates, renewals, cancellation windows, obligations and plain-language summaries with ContractSnap.",
  eyebrow: "ContractSnap", headline: "The dates and obligations in your contracts, easier to find.",
  subhead: "Turn an uploaded contract into a structured record with a plain-language AI summary, key dates, renewal and cancellation details, obligations, clauses, and a timeline. The original remains the source of truth.",
  ctaPrimary: "Start your contract record", ctaPrimaryPrice: "$4.99/month", ctaSecondary: "or $49.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.CONTRACTSNAP_MONTHLY, primaryButton: "Get ContractSnap — $4.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.CONTRACTSNAP_ANNUAL, yearlyButton: "Get ContractSnap — $49.99/year",
  monthlyPrice: "$4.99", yearlyPrice: "$49.99", yearlyBadge: "two months free", yearlyApx: "≈ $4.17/mo",
  monthlyBlurb: "Good for trying it out", yearlyBlurb: "Keeping contracts organized for the long haul", cardLine: "Full ContractSnap access",
  benefitsHeading: "Why keep a structured contract record?",
  benefits: [
    { title: "Bring important terms forward", body: "Review dates, renewal and cancellation details, payment information, obligations, clauses, and a plain-language summary without treating the summary as a substitute for the original." },
    { title: "See the contract timeline", body: "Signed, effective, cancellation, renewal, and expiration events can be collected into one timeline." },
    { title: "Know what needs review", body: "Extracted facts carry source status and confidence information so interpreted or low-confidence details can be checked against the contract." },
  ],
  featuresHeading: "What you can do",
  features: [
    "Extract parties, dates, renewal terms, cancellation windows, payment details, fees, penalties, jurisdiction, and major obligations.",
    "Review a plain-language AI summary plus detected clauses and important dates.",
    "See confidence and source-status signals on extracted facts.",
    "Search saved contracts and keep the original source text as the source of truth.",
    "Track contract events and reminder records for renewal, cancellation, and expiration dates.",
  ],
  startNoteTitle: "Not sure where to start?", startNoteBody: "Add a contract with a renewal, cancellation window, or expiration date you do not want buried in the fine print.",
  resourceLinks: [
    { href: "/resources/how-to-organize-scanned-documents", label: "How to organize scanned documents" },
    { href: "/resources/mobile-scanner-privacy", label: "Mobile scanner privacy" },
    { href: "/resources/local-vs-cloud-document-scanning", label: "Local vs. cloud document scanning" },
  ],
};
function ContractSnapSalesPage() { return <ModuleSalesPage {...CONFIG} />; }
