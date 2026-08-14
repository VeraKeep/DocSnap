import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: 'Changelog — DocSnap © 2026' },
      { name: "description", content: "See what's new in DocSnap © 2026 — product updates, features, fixes, and improvements to the browser-based scanner." },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/changelog" }],
  }) ,
  component: Changelog,
});

interface ChangelogEntry {
  date: string;
  title: string;
  items: string[];
}

const entries: ChangelogEntry[] = [
  {
    date: "August 2026",
    title: "Pro subscription & 4-tier pricing",
    items: [
      "Pro subscription with 4-tier pricing — Free ($0), Personal ($7.99/mo), Household ($12.99/mo), and Complete ($19.99/mo)",
      "Password-protected PDFs — encrypt scans with a password",
      "AI document naming — automatic titles generated from OCR text",
      "Expiration detection and reminders — browser notifications when important dates approach",
    ],
  },
  {
    date: "August 2026",
    title: "Sharing, redaction & duplicate detection",
    items: [
      "Shareable secure links — time-limited, password-protected document sharing",
      "Redaction tool — draw to redact, permanently burned into the PDF",
      "Duplicate detection — identifies repeated scans by file hash and OCR similarity",
    ],
  },
  {
    date: "August 2026",
    title: "PWA, analytics & SEO",
    items: [
      "PWA support — install DocSnap © 2026 on your home screen, with offline support via a service worker",
      "Privacy-friendly analytics (Plausible) with custom product events",
      "SEO landing page at /scan with structured data",
    ],
  },
  {
    date: "July 2026",
    title: "Trust pages & polish",
    items: [
      "Added Terms of Service, Contact, FAQ, and Changelog pages",
      "Updated footer with links to all trust pages",
      "Added privacy page detailing local-first architecture",
    ],
  },
  {
    date: "July 2026",
    title: "Import, shortcuts & info pages",
    items: [
      "Import from photos — select images from your device library",
      "Keyboard shortcuts for desktop users (Space to capture, D to download, R to retake)",
      "Privacy and About pages",
    ],
  },
  {
    date: "July 2026",
    title: "Image filters, OCR & Cloud Sync",
    items: [
      "Image filters: Auto, B&W, Grayscale, High Contrast, Receipt, and Color",
      "OCR engine for creating searchable PDFs (English)",
      "Cloud Sync via Clerk authentication and Uploadthing storage",
      "Drag-and-drop page reordering",
    ],
  },
  {
    date: "July 2026",
    title: "Initial launch",
    items: [
      "Camera capture using the browser MediaDevices API",
      "Auto edge detection, crop, and deskew",
      "Multi-page scanning into a single PDF",
      "Client-side PDF generation — no uploads, no servers",
    ],
  },
];

function Changelog() {
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

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Changelog</h1>
        <p className="mt-2 text-gray-400">What's new in DocSnap © 2026</p>

        <div className="mt-10 space-y-10">
          {entries.map((entry, i) => (
            <div key={i} className="relative border-l-2 border-gray-800 pl-6">
              {/* Timeline dot */}
              <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />

              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-indigo-400">
                  {entry.date}
                </span>
                <h2 className="text-lg font-semibold text-white">
                  {entry.title}
                </h2>
              </div>

              <ul className="mt-3 space-y-1.5">
                {entry.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-2 text-sm text-gray-300"
                  >
                    <span className="text-indigo-500">▹</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap © 2026 — one place for the important stuff you own and the documents that go with it</span>
      </footer>
    </main>
  );
}
