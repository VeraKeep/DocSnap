import { createFileRoute, Link } from "@tanstack/react-router";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "DocSnap © 2026",
  description:
    "One place for the important stuff you own and the documents that go with it — scan any document to a searchable PDF right in your browser using your camera. No account, no uploads. Part of the VeraKeep™ suite.",
  url: "https://docsnapapp.com/scan",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      {
        title: "DocSnap — One Place for the Important Stuff You Own | Free Document Scanner",
      },
      {
        name: "description",
        content:
          "Scan any document to a searchable PDF right in your browser — no account needed, everything runs locally. DocSnap is one place for the important stuff you own and the documents that go with it, part of the VeraKeep™ suite.",
      },
      {
        name: "keywords",
        content:
          "free document scanner, scan documents online, convert paper to searchable PDF, camera to PDF, OCR document scanner free, online document scanner, scan to PDF, organize important documents, document organizer, VeraKeep",
      },
      {
        property: "og:title",
        content: "DocSnap — One Place for the Important Stuff You Own | Free Document Scanner",
      },
      {
        property: "og:description",
        content:
          "Scan any document to a searchable PDF right in your browser — no account needed. DocSnap is one place for the important stuff you own and the documents that go with it, part of the VeraKeep™ suite.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://docsnapapp.com/scan",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "DocSnap — One Place for the Important Stuff You Own | Free Document Scanner",
      },
      {
        name: "twitter:description",
        content:
          "Scan any document to a searchable PDF right in your browser — no account needed. Part of the VeraKeep™ suite.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://docsnapapp.com/scan" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(structuredData),
      },
    ],
  }),
  component: ScanLanding,
});

function ScanLanding() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* ── Hero Section ── */}
      <section className="relative flex flex-col items-center overflow-hidden px-6 pb-12 pt-20 text-center sm:pt-28">
        {/* Gradient background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(79,70,229,0.25) 0%, rgba(3,7,18,0) 70%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse 40% 40% at 80% 80%, rgba(99,102,241,0.2) 0%, rgba(3,7,18,0) 70%)",
          }}
        />

        {/* Badge */}
        <div className="relative z-10 mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          100% Free — No Sign-Up Required
        </div>

        {/* Logo */}
        <div className="relative z-10 mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10"
            fill="none"
            viewBox="0 0 64 64"
          >
            <path
              d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17"
              stroke="#fff"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M46 20l-6 12 6 12"
              stroke="#a5b4fc"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="relative z-10 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          One Place for the Important Stuff You Own —{" "}
          <span className="text-indigo-400">and the Documents That Go With It</span>
        </h1>

        <p className="relative z-10 mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
          Point your camera at any document and get a clean, searchable PDF right
          in your browser — no account, no uploads, no Adobe license. Everything
          runs locally, and it's completely free.
        </p>

        <p className="relative z-10 mt-4 text-sm text-indigo-300/80">
          DocSnap is the hub of the VeraKeep™ suite — one place for everything you
          own and the paperwork that goes with it. ReceiptSnap, GarageSnap, and
          more are coming soon.
        </p>

        {/* CTA */}
        <div className="relative z-10 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
              />
            </svg>
            Start Scanning Free
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-full border border-gray-600 bg-gray-800 px-6 py-4 text-lg font-medium text-gray-200 transition-all hover:border-gray-400 hover:bg-gray-700 active:scale-95"
          >
            Learn More
          </Link>
        </div>

        {/* Trust signals */}
        <p className="relative z-10 mt-6 text-sm text-gray-600">
          No credit card • No account • No file uploads • Works on phone & desktop
        </p>
      </section>

      {/* ── How It Works ── */}
      <section className="border-t border-gray-800/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            How It Works
          </h2>
          <p className="mt-4 text-center text-gray-400">
            Three simple steps from camera to PDF — no software to install
          </p>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                icon: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                    />
                  </svg>
                ),
                title: "Open Camera",
                description:
                  "Grant camera access or import photos from your device. Works on phones, tablets, and laptops.",
              },
              {
                step: "2",
                icon: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.481 2.738.707.399m0 0a3 3 0 1 0 5.196-3 3 3 0 0 0-5.196 3Z"
                    />
                  </svg>
                ),
                title: "Snap or Import",
                description:
                  "Capture your document with auto edge detection and crop. Add multiple pages to a single PDF.",
              },
              {
                step: "3",
                icon: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                ),
                title: "Download PDF",
                description:
                  "Get a clean, searchable PDF with selectable text via OCR. No watermarks, no limits — it's yours.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl border border-gray-800 bg-gray-900/60 p-8 transition hover:border-gray-700"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
                  {item.icon}
                </div>
                <div className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-lg">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Highlights ── */}
      <section className="border-t border-gray-800/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Everything You Need to{" "}
            <span className="text-indigo-400">Scan, Store & Organize</span>
          </h2>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "📷",
                title: "Camera Scanning",
                description:
                  "Use your phone or laptop camera to scan documents, receipts, and ID cards instantly.",
              },
              {
                icon: "🖼️",
                title: "Import from Photos",
                description:
                  "Already have a photo? Import it directly and convert to PDF — supports JPG and PNG.",
              },
              {
                icon: "✂️",
                title: "Edge Detection & Auto-Crop",
                description:
                  "Smart document detection automatically finds edges, straightens, and crops your scans.",
              },
              {
                icon: "🔍",
                title: "OCR — Searchable PDFs",
                description:
                  "Built-in OCR converts scanned text into selectable, searchable content in your PDF.",
              },
              {
                icon: "📄",
                title: "Multi-Page PDFs",
                description:
                  "Combine multiple scans into a single PDF. Reorder pages with drag-and-drop.",
              },
              {
                icon: "🎨",
                title: "Image Filters",
                description:
                  "Apply B&W, grayscale, high contrast, or receipt-optimized filters for the perfect scan.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-6 transition hover:border-gray-700"
              >
                <span className="text-2xl">{feature.icon}</span>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Mini CTA */}
          <div className="mt-10 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 active:scale-95"
            >
              Try All Features Free
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Part of the VeraKeep™ Suite ── */}
      <section className="border-t border-gray-800/50 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">
            Part of the VeraKeep™ Suite
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            One Place for Everything You Own
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-400">
            DocSnap is the hub of the VeraKeep™ suite — one place for the
            important stuff you own and the documents that go with it.
            ReceiptSnap for your receipts, GarageSnap for your vehicle records,
            and more consumer and home modules are on the way.
          </p>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section className="border-t border-gray-800/50 px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h2>

          <div className="mt-12 space-y-4">
            {[
              {
                q: "Is DocSnap © 2026 really free?",
                a: (
                  <>
                    Scanning is free — you can capture, crop, filter, OCR, and download PDFs entirely in your browser with no account and no charge. Paid plans (Personal, Household, or Complete) add cloud storage and Pro features like password-protected PDFs, AI document naming, expiration reminders, secure sharing, redaction, and duplicate detection. See{" "}
                    <Link to="/pricing" className="text-indigo-400 underline">our pricing page</Link>{" "}
                    for details.
                  </>
                ),
              },
              {
                q: "Do I need to create an account?",
                a: "No account is required. You can scan documents and download PDFs immediately without signing up. An optional free account is available if you want to save scans to the cloud for later access.",
              },
              {
                q: "Is my data private?",
                a: "Absolutely. All document processing — including scanning, cropping, filtering, and OCR — happens entirely in your browser. Your images never leave your device unless you explicitly choose to save them to cloud storage.",
              },
              {
                q: "Does OCR work for all languages?",
                a: "DocSnap © 2026 uses Tesseract.js for OCR, which supports 100+ languages including English, Spanish, French, German, Chinese, Japanese, and more. English is the default; additional language support is planned.",
              },
            ].map((faq, i) => (
              <details
                key={i}
                className="group rounded-xl border border-gray-800 bg-gray-900/40 transition hover:border-gray-700"
              >
                <summary className="flex cursor-pointer items-center justify-between px-6 py-5 font-semibold list-none">
                  {faq.q}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 shrink-0 text-gray-500 transition group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-sm leading-relaxed text-gray-400">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-gray-800/50 px-6 py-20">
        <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 text-center sm:p-16">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Scan Your First Document?
            </h2>
            <p className="mt-4 text-lg text-indigo-200">
              No account. No upload. No catch. Just open your camera and go.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-semibold text-indigo-700 shadow-lg transition-all hover:bg-indigo-50 active:scale-95"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
              </svg>
              Start Scanning Free
            </Link>
            <p className="mt-5 text-sm text-indigo-300/70">
              Works on iPhone, Android, and desktop browsers
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/" className="transition hover:text-gray-400">
          Scanner
        </Link>
        <Link to="/privacy" className="transition hover:text-gray-400">
          Privacy
        </Link>
        <Link to="/terms" className="transition hover:text-gray-400">
          Terms
        </Link>
        <Link to="/contact" className="transition hover:text-gray-400">
          Contact
        </Link>
        <Link to="/faq" className="transition hover:text-gray-400">
          FAQ
        </Link>
        <Link to="/changelog" className="transition hover:text-gray-400">
          Changelog
        </Link>
        <Link to="/about" className="transition hover:text-gray-400">
          About
        </Link>
      </footer>
    </main>
  );
}
