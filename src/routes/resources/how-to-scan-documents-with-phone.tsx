import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalUrl } from "../../siteConfig";

export const Route = createFileRoute("/resources/how-to-scan-documents-with-phone")({
  head: () => ({
    meta: [
      { title: "How to Scan Documents With Your Phone Camera — DocSnap" },
      {
        name: "description",
        content:
          "Learn how to scan documents with your iPhone or Android camera, improve scan quality, combine multiple pages, and create a searchable PDF.",
      },
      { property: "og:title", content: "How to Scan Documents With Your Phone Camera" },
      {
        property: "og:description",
        content:
          "A practical step-by-step guide to scanning paper documents into clean, searchable PDFs with your phone.",
      },
      { property: "og:type", content: "article" },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/resources/how-to-scan-documents-with-phone") },
    ],
  }),
  component: PhoneScanningGuide,
});

function PhoneScanningGuide() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <nav className="mb-8 text-sm text-gray-400" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-white">DocSnap</Link>
          <span className="px-2">/</span>
          <Link to="/resources" className="hover:text-white">Resources</Link>
          <span className="px-2">/</span>
          <span>Phone scanning</span>
        </nav>

        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-400">
          Mobile document scanning
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          How to Scan Documents With Your Phone Camera
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-300">
          You do not need a desktop scanner to turn everyday paperwork into a useful PDF.
          A modern phone camera can capture the pages; document-scanning software then helps
          crop, straighten, improve, combine, and—when OCR is enabled—make the text searchable.
        </p>

        <div className="mt-8 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6">
          <p className="font-semibold">Want to scan one now?</p>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            DocSnap runs in your browser and lets you capture or import pages, adjust them,
            combine multiple pages, and download a PDF. Core scanning and local PDF creation
            are free.
          </p>
          <Link
            to="/scan"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold transition hover:bg-indigo-500"
          >
            Scan a document free
          </Link>
        </div>

        <div className="mt-12 space-y-10 text-gray-300">
          <section>
            <h2 className="text-2xl font-semibold text-white">1. Put the document on a flat surface</h2>
            <p className="mt-3 leading-7">
              Use a surface that contrasts with the page. Smooth out folds and keep the entire
              sheet visible. Good lighting matters more than an expensive camera: bright,
              even light reduces shadows and makes text easier to recognize.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">2. Hold your phone directly above the page</h2>
            <p className="mt-3 leading-7">
              Try to keep the camera parallel to the document rather than shooting from an
              angle. Leave a small border around the page so the scanning software has room
              to detect its edges and correct perspective.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">3. Capture or import the page</h2>
            <p className="mt-3 leading-7">
              In DocSnap you can use your phone camera or import an existing image. After the
              page is captured, you can crop it and apply image adjustments before creating
              the PDF.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">4. Add the rest of the pages</h2>
            <p className="mt-3 leading-7">
              A multi-page document does not need to become a folder full of individual
              photos. Capture or import the remaining pages, put them in the correct order,
              and combine them into one PDF.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">5. Turn on OCR when you need searchable text</h2>
            <p className="mt-3 leading-7">
              OCR—optical character recognition—recognizes printed text in the scanned image.
              With OCR enabled, DocSnap can create a searchable PDF instead of a PDF that is
              only a collection of page images. That makes old paperwork much easier to find
              later by searching for words, names, or numbers inside it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">6. Review before you delete the paper</h2>
            <p className="mt-3 leading-7">
              Open the finished PDF and check every page. Make sure small print is readable,
              pages are in order, nothing was cropped out, and OCR works if you enabled it.
              Keep originals whenever a law, organization, warranty, or personal need requires
              the physical document.
            </p>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
            <h2 className="text-2xl font-semibold text-white">Phone scan vs. taking a normal photo</h2>
            <p className="mt-3 leading-7">
              A camera photo records the page as a picture. A document-scanning workflow is
              designed to turn that picture into a document: crop the page, correct its shape,
              improve readability, combine pages, create a PDF, and optionally recognize text.
              That is the main reason to use a scanner workflow instead of leaving important
              paperwork mixed into your camera roll.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">Can an iPhone or Android replace a physical scanner?</h2>
            <p className="mt-3 leading-7">
              For many everyday documents, yes. Phone scanning is especially convenient for
              receipts, bills, school paperwork, household records, contracts, and documents
              you need to send quickly. A dedicated scanner can still make sense for very large
              batches, specialized media, or workflows that require particular hardware.
            </p>
          </section>
        </div>

        <section className="mt-14 rounded-2xl border border-gray-800 bg-gray-900 p-7 text-center">
          <h2 className="text-2xl font-semibold">Turn the next paper in front of you into a PDF</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-400">
            Try the DocSnap scanner in your browser. No dedicated scanner hardware is required.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/scan" className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500">
              Scan now
            </Link>
            <Link to="/faq" className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold hover:border-gray-500">
              Read the FAQ
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
