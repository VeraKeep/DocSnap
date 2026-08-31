import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/** /contractsnap-sales — public sales/landing page for ContractSnap. */
export const Route = createFileRoute("/contractsnap-sales")({
  head: () => ({
    meta: [
      { title: "ContractSnap — DocSnap" },
      {
        name: "description",
        content:
          "Key contract terms at a glance with ContractSnap — a paid add-on inside DocSnap. Upload the contract, know what you agreed to: renewals, deadlines, and obligations in plain language.",
      },
    ],
  }),
  component: ContractSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "ContractSnap",
  logo: "📄",
  metaTitle: "ContractSnap — DocSnap",
  metaDescription:
    "Key contract terms at a glance with ContractSnap — a paid add-on inside DocSnap. Upload the contract, know what you agreed to: renewals, deadlines, and obligations in plain language.",
  eyebrow: "ContractSnap",
  headline: "Key contract terms, at a glance.",
  subhead:
    "Upload a contract and know what you actually agreed to — renewals, deadlines, and obligations extracted into a plain-language summary. No more rereading the fine print to find the date that matters.",
  ctaPrimary: "Start your contract record",
  ctaPrimaryPrice: "$4.99/month",
  ctaSecondary: "or $49.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.CONTRACTSNAP_MONTHLY,
  primaryButton: "Get ContractSnap — $4.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.CONTRACTSNAP_ANNUAL,
  yearlyButton: "Get ContractSnap — $49.99/year",
  monthlyPrice: "$4.99",
  yearlyPrice: "$49.99",
  yearlyBadge: "two months free",
  yearlyApx: "≈ $4.17/mo",
  monthlyBlurb: "Good for trying it out",
  yearlyBlurb: "Keeping every contract on record for the long haul",
  cardLine: "Full ContractSnap access",
  benefitsHeading: "Why keep a contract record at all?",
  benefits: [
    {
      title: "Know what you agreed to — without the fine print",
      body: "Contracts hide the details that matter: when it renews, what you owe, and what each side must do. ContractSnap reads the contract and surfaces the key terms in one plain-language summary, so you're never surprised by a clause you forgot.",
    },
    {
      title: "Never miss a renewal or deadline again",
      body: "Renewals, deadlines, and obligations get extracted and put on a timeline. When something important is coming up, you know before it's a problem.",
    },
    {
      title: "Keep every agreement searchable",
      body: "Store all your contracts in one place with their key terms attached. Years from now, you'll still know what you signed, when, and what it obligated — without rereading the whole document.",
    },
  ],
  featuresHeading: "What you can do",
  features: [
    "Upload a contract and get key terms extracted — parties, dates, renewals, deadlines, and obligations — in plain language.",
    "See a contract timeline of the dates that matter, so nothing slips past.",
    "Search across all your contracts by party, date, or term — find any agreement in seconds.",
    "Keep contracts and their summaries organised in one place, alongside your other DocSnap documents.",
    "Have the full original on record as the source of truth, with the summary as the quick reference.",
  ],
  startNoteTitle: "Not sure where to start?",
  startNoteBody:
    "Add the contract you're most worried about forgetting — a renewal, an agreement with a deadline, or one you'd have to dig out for a dispute. You can backfill the rest over time.",
};

function ContractSnapSalesPage() {
  return <ModuleSalesPage {...CONFIG} />;
}
