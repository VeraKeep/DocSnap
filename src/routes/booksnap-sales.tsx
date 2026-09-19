import { createFileRoute } from "@tanstack/react-router";
import { ModuleSalesPage, type ModuleSalesConfig } from "~/components/ModuleSalesPage";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import { canonicalUrl } from "~/siteConfig";

export const Route = createFileRoute("/booksnap-sales")({
  head: () => ({
    meta: [
      { title: "Personal Library & Book Search | BookSnap by DocSnap" },
      { name: "description", content: "Catalog books by title, author, ISBN and edition, add page-aware notes and quotes, and search your own library with BookSnap." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/booksnap-sales") }],
  }),
  component: BookSnapSalesPage,
});
const CONFIG: ModuleSalesConfig = {
  moduleName: "BookSnap", logo: "📚", metaTitle: "Personal Library & Book Search | BookSnap by DocSnap",
  metaDescription: "Catalog books by title, author, ISBN and edition, add page-aware notes and quotes, and search your own library with BookSnap.",
  eyebrow: "BookSnap", headline: "Your bookshelf, searchable and on record.",
  subhead: "Catalog the books you own, keep edition and ISBN details, and—when page text is available—save page-aware quotes and notes and search your own stored book text.",
  ctaPrimary: "Start your bookshelf", ctaPrimaryPrice: "$3.99/month", ctaSecondary: "or $39.99/year — two months free",
  primaryHref: MODULE_CHECKOUT_URLS.BOOKSNAP_MONTHLY, primaryButton: "Get BookSnap — $3.99/month",
  yearlyHref: MODULE_CHECKOUT_URLS.BOOKSNAP_ANNUAL, yearlyButton: "Get BookSnap — $39.99/year",
  monthlyPrice: "$3.99", yearlyPrice: "$39.99", yearlyBadge: "two months free", yearlyApx: "≈ $3.33/mo",
  monthlyBlurb: "Good for trying it out", yearlyBlurb: "Keeping your library on record for the long haul", cardLine: "Full BookSnap access",
  benefitsHeading: "Why keep a digital bookshelf?",
  benefits: [
    { title: "Know exactly what you own", body: "Keep title, author, ISBN, edition, publisher, year, reading status, collection, and tags together." },
    { title: "Anchor notes to real pages", body: "When page text has been ingested, annotations can retain the page and paragraph that a quote came from." },
    { title: "Search without inventing citations", body: "Search results use stored book metadata or your own stored page text and preserve page attribution when it exists." },
  ],
  featuresHeading: "What you can do",
  features: [
    "Catalog books with title, author, ISBN, edition, publisher, year, collection, tags, and reading status.",
    "Optionally extract text from a PDF you provide for your own library record.",
    "Read stored pages and save page-anchored quotes and notes when page data is available.",
    "Search book metadata and stored page text with page attribution where available.",
    "Keep the original file reference and stored source text tied to your own book record.",
  ],
  startNoteTitle: "Not sure where to start?", startNoteBody: "Add a book you refer to often, then build out collections and page-aware notes as your library grows.",
  resourceLinks: [
    { href: "/resources/how-to-organize-scanned-documents", label: "How to organize scanned documents" },
    { href: "/resources/how-to-scan-without-losing-quality", label: "Scan without losing quality" },
    { href: "/resources/searchable-pdf-ocr", label: "Searchable PDFs and OCR" },
  ],
};
function BookSnapSalesPage() { return <ModuleSalesPage {...CONFIG} />; }
