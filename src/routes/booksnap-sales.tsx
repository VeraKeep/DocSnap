import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/** /booksnap-sales — public sales/landing page for BookSnap. */
export const Route = createFileRoute("/booksnap-sales")({
  head: () => ({
    meta: [
      { title: "BookSnap — DocSnap" },
      {
        name: "description",
        content:
          "Add books to your shelf and keep every edition, page, and quote on record with BookSnap — a paid add-on inside DocSnap.",
      },
    ],
  }),
  component: BookSnapSalesPage,
});

const CONFIG: ModuleSalesConfig = {
  moduleName: "BookSnap",
  logo: "📚",
  metaTitle: "BookSnap — DocSnap",
  metaDescription:
    "Add books to your shelf and keep every edition, page, and quote on record with BookSnap — a paid add-on inside DocSnap.",
  eyebrow: "BookSnap",
  headline: "Your bookshelf, on record.",
  subhead:
    "Add books to your shelf and keep every edition, page, and quote on record. BookSnap turns your library into a searchable record — the books you own, the passages that mattered, and where to find them again.",
  ctaPrimary: "Start your bookshelf",
  ctaPrimaryPrice: "$3.99/month",
  ctaSecondary: "or $39.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.BOOKSNAP_MONTHLY,
  primaryButton: "Get BookSnap — $3.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.BOOKSNAP_ANNUAL,
  yearlyButton: "Get BookSnap — $39.99/year",
  monthlyPrice: "$3.99",
  yearlyPrice: "$39.99",
  yearlyBadge: "two months free",
  yearlyApx: "≈ $3.33/mo",
  monthlyBlurb: "Good for trying it out",
  yearlyBlurb: "Keeping your library on record for the long haul",
  cardLine: "Full BookSnap access",
  benefitsHeading: "Why keep a bookshelf record at all?",
  benefits: [
    {
      title: "Know exactly what you own",
      body: "Collections grow faster than memory. BookSnap keeps every book on your shelf — each edition on record — so you always know what you have and which edition it is.",
    },
    {
      title: "Keep the passages that mattered",
      body: "That quote or page you want to come back to — BookSnap keeps it on record and searchable, so you can find it again without flipping through every page.",
    },
    {
      title: "A library that grows with you",
      body: "Add each book as it arrives and keep it organized in one place, alongside the rest of your important records. Years from now, your shelf and your notes are still there.",
    },
  ],
  featuresHeading: "What you can do",
  features: [
    "Add books to your shelf with their edition on record — build a searchable record of what you own.",
    "Keep pages and quotes on record, so the passages that mattered are easy to find again.",
    "Search your collection by title or author — find any book in seconds.",
    "Organize your library in one place, alongside your other DocSnap documents.",
    "Rely on it for years — a growing record of every book you've added and what you saved from it.",
  ],
  startNoteTitle: "Not sure where to start?",
  startNoteBody:
    "Add a book you reach for often, or one with a quote you keep wanting to find. You can add the rest over time; your shelf grows with every book.",
};

function BookSnapSalesPage() {
  return <ModuleSalesPage {...CONFIG} />;
}
