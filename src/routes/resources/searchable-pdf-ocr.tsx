import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalUrl } from "../../siteConfig";

export const Route = createFileRoute("/resources/searchable-pdf-ocr")({
  head: () => ({
    meta: [
      { title: "How to Make Scanned Documents Searchable With OCR — DocSnap" },
      { name: "description", content: "Learn how OCR turns phone scans into searchable PDFs, why scan quality matters, and how DocSnap creates a searchable text layer in your browser." },
      { property: "og:title", content: "How to Make Scanned Documents Searchable With OCR" },
      { property: "og:description", content: "A practical guide to OCR and searchable PDFs from phone scans." },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/resources/searchable-pdf-ocr") }],
  }),
  component: Guide,
});

function Guide() {
  return <main className="min-h-screen bg-gray-950 px-6 py-14 text-white"><article className="mx-auto max-w-3xl">
    <Link to="/resources" className="text-sm text-indigo-400">← Resources</Link>
    <p className="mt-8 text-sm font-semibold uppercase tracking-wider text-indigo-400">OCR & searchable PDFs</p>
    <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">How to make scanned documents searchable with OCR</h1>
    <p className="mt-6 text-lg leading-8 text-gray-300">A picture of a document may look readable, but a computer normally sees pixels rather than words. Optical character recognition (OCR) identifies the text so it can be searched and included as a text layer in a PDF.</p>
    <section className="mt-10 space-y-5 leading-8 text-gray-300">
      <h2 className="text-2xl font-semibold text-white">What makes a PDF searchable?</h2><p>A searchable PDF combines the page image with recognized text. The page can keep the appearance of the original scan while the text layer makes words searchable and selectable.</p>
      <h2 className="text-2xl font-semibold text-white">Scan quality still matters</h2><p>Good lighting, a flat page, sharp focus, and a straight camera angle give OCR cleaner source material. Cropping away the desk or background also helps keep the document itself prominent.</p>
      <h2 className="text-2xl font-semibold text-white">How DocSnap handles it</h2><p>DocSnap can run OCR in the browser and use recognized words to create an invisible searchable text layer over the scanned page. That lets you create a searchable PDF without sending the scan to a server just to perform OCR.</p>
      <h2 className="text-2xl font-semibold text-white">For multi-page paperwork</h2><p>Scan all of the pages first, put them in the correct order, and then create one searchable PDF. This is useful for contracts, statements, forms, records, and other documents that should stay together.</p>
    </section>
    <div className="mt-12 flex flex-wrap gap-3"><Link to="/scan" className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold">Create a searchable scan</Link><Link to="/resources/scan-multiple-pages-one-pdf" className="rounded-lg border border-gray-700 px-5 py-3 font-semibold">Multi-page scanning →</Link></div>
  </article></main>;
}