import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: 'FAQ — DocSnap © 2026' },
      { name: "description", content: 'Frequently asked questions about DocSnap © 2026 — document scanning, OCR, cloud sync, pricing, privacy, and using the app safely.' },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/faq" }],
  }) ,
  component: FAQ,
});

interface FAQItem {
  q: string;
  a: React.ReactNode;
}

const faqs: FAQItem[] = [
  {
    q: "Is DocSnap © 2026 really free?",
    a: (
      <>
        Yes! All core features — camera capture, image filters, edge
        detection, multi-page PDFs, and searchable OCR — are completely free
        and run locally in your browser. Cloud Sync is included with paid Personal and Family plans. Scanning and local PDF downloads remain free forever.
      </>
    ),
  },
  {
    q: "Do my documents leave my device?",
    a: (
      <>
        No. All processing — scanning, cropping, filtering, OCR, and PDF
        generation — happens entirely in your browser. Your images and
        documents never touch our servers. The only exception is if you
        choose to use Cloud Sync and actively save a document to the cloud.
        Even then, only the final PDF is uploaded; the original camera images
        stay on your device.
      </>
    ),
  },
  {
    q: "What file format does it produce?",
    a: (
      <>
        DocSnap © 2026 produces standard PDF files. You can optionally enable OCR
        (optical character recognition) to create searchable PDFs — making
        the text selectable and searchable within the document. Without OCR,
        the PDF contains embedded images of your scanned pages.
      </>
    ),
  },
  {
    q: "Does it work on iPhone and Android?",
    a: (
      <>
        Yes, DocSnap © 2026 works on any modern browser — Chrome, Safari, Firefox,
        and Edge — on both desktop and mobile. On iPhones and Android
        devices, you can use your camera directly or import photos from your
        library. The interface is responsive and designed to work well on
        small screens.
      </>
    ),
  },
  {
    q: "Can I scan multiple pages into one PDF?",
    a: (
      <>
        Absolutely. You can capture as many pages as you like, or import
        multiple images at once. All pages are combined into a single PDF.
        You can also drag and drop to reorder pages before downloading.
      </>
    ),
  },
  {
    q: "What languages does OCR support?",
    a: (
      <>
        Currently, OCR supports English. We use Tesseract.js, which is
        capable of recognizing many languages, and we plan to add support
        for more languages in the future. If there's a language you'd like
        to see,{" "}
        <Link to="/contact" className="text-indigo-400 underline">
          let us know
        </Link>
        !
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        If you signed up for Cloud Sync and want to delete your account and
        all associated data, just{" "}
        <Link to="/contact" className="text-indigo-400 underline">
          contact us
        </Link>{" "}
        at{" "}
        <a
          href="mailto:support@docsnapapp.com"
          className="text-indigo-400 underline"
        >
          support@docsnapapp.com
        </a>
        . We'll handle it promptly. You can also delete individual documents
        yourself from the My Scans view.
      </>
    ),
  },
];

function FAQItem({ item, defaultOpen = false }: { item: FAQItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left transition hover:text-white"
      >
        <span className="text-lg font-medium text-white">{item.q}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      {open && (
        <div className="pb-4 text-gray-300 leading-relaxed">{item.a}</div>
      )}
    </div>
  );
}

function FAQ() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 sm:py-16">
        {/* Back link */}
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </Link>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">FAQ</h1>
        <p className="mt-2 text-gray-400">Frequently asked questions</p>

        <div className="mt-10">
          {faqs.map((item) => (
            <FAQItem key={item.q} item={item} />
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500">
          Still have a question?{" "}
          <Link to="/contact" className="text-indigo-400 underline">
            Reach out
          </Link>{" "}
          — we're happy to help.
        </p>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap © 2026 — one place for the important stuff you own and the documents that go with it</span>
      </footer>
    </main>
  );
}
