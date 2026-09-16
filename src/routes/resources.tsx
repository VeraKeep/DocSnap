import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalUrl } from "../siteConfig";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Mobile Document Scanning Guides & Resources — DocSnap" },
      { name: "description", content: "Practical guides for scanning documents with your phone, creating searchable PDFs, organizing digital paperwork, and getting better mobile scans." },
      { property: "og:title", content: "Mobile Document Scanning Guides — DocSnap" },
      { property: "og:description", content: "Learn how to scan, organize, search, and manage documents from your phone with practical DocSnap guides." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/resources") }],
  }),
  component: ResourcesPage,
});

const guides = [
  { to: "/resources/how-to-scan-documents-with-phone" as const, title: "How to Scan Documents With Your Phone Camera", description: "Turn paper into clean PDFs with the phone you already have.", tag: "Getting started" },
  { to: "/resources/searchable-pdf-ocr" as const, title: "How to Make Scanned Documents Searchable With OCR", description: "Understand OCR and how searchable PDF text layers work.", tag: "OCR" },
  { to: "/resources/scan-multiple-pages-one-pdf" as const, title: "How to Scan Multiple Pages Into One PDF", description: "Capture, reorder, review, and combine related pages into one file.", tag: "Multi-page" },
  { to: "/resources/how-to-scan-without-losing-quality" as const, title: "How to Scan Documents Without Losing Quality", description: "Improve lighting, focus, positioning, cropping, and image treatment.", tag: "Scan quality" },
  { to: "/resources/automatic-cropping-straightening" as const, title: "Automatic Cropping & Straightening Explained", description: "See how edge detection and perspective correction clean up phone scans.", tag: "Document cleanup" },
  { to: "/resources/document-scanner-vs-camera" as const, title: "Document Scanner App vs. Phone Camera", description: "Learn what a scanner workflow adds beyond taking a normal photo.", tag: "Comparison" },
];

function ResourcesPage() {
  return <main className="min-h-screen bg-gray-950 text-white">
    <section className="border-b border-gray-800/70 px-6 py-16 sm:py-20"><div className="mx-auto max-w-5xl">
      <Link to="/" className="text-sm text-indigo-400 transition hover:text-indigo-300">← DocSnap</Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-400">DocSnap Resources</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Better ways to scan, organize, and find your documents</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-300">Straightforward guides for mobile document scanning, searchable PDFs, OCR, paperless organization, and everyday document workflows.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/scan" className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500">Scan a document free</Link><Link to="/pricing" className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-200 transition hover:border-gray-500 hover:text-white">View plans</Link></div>
    </div></section>
    <section className="px-6 py-12 sm:py-16"><div className="mx-auto max-w-5xl"><div className="grid gap-5 md:grid-cols-2">{guides.map((guide)=><Link key={guide.to} to={guide.to} className="group rounded-2xl border border-gray-800 bg-gray-900/50 p-6 transition hover:border-indigo-500/60 hover:bg-gray-900"><span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">{guide.tag}</span><h2 className="mt-3 text-xl font-semibold text-white group-hover:text-indigo-200">{guide.title}</h2><p className="mt-3 leading-7 text-gray-400">{guide.description}</p><span className="mt-5 inline-block text-sm font-medium text-indigo-400">Read guide →</span></Link>)}</div></div></section>
  </main>;
}