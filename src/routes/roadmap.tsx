import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — DocSnap" },
      { name: "description", content: "See what's coming to DocSnap — what we're working on now, what's planned next, future ideas, and everything we've already shipped." },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/roadmap" }],
  }),
  component: Roadmap,
});

interface Section {
  title: string;
  blurb: string;
  dotClass: string;
  labelClass: string;
  borderClass: string;
  items: string[];
}

const sections: Section[] = [
  {
    title: "Now",
    blurb: "What we're actively working on",
    dotClass: "bg-indigo-500",
    labelClass: "text-indigo-400",
    borderClass: "border-indigo-500/30",
    items: [
      "Bug fixes and reliability improvements across scanning, OCR, and cloud sync",
      "Performance — faster page loads, code splitting, and a smaller bundle",
      "Edge-case polish for document detection (low light, shadows, angled shots)",
    ],
  },
  {
    title: "Next",
    blurb: "Planned for the near term",
    dotClass: "bg-amber-400",
    labelClass: "text-amber-400",
    borderClass: "border-amber-400/30",
    items: [
      "Offline mode — scan and save documents without an internet connection",
      "PWA support — install DocSnap on your home screen like a native app",
      "AI document summaries and Q&A on your scanned documents",
      "Smart auto-naming and auto-filing for new scans",
    ],
  },
  {
    title: "Later",
    blurb: "Ideas on the radar — nothing committed yet",
    dotClass: "bg-gray-500",
    labelClass: "text-gray-400",
    borderClass: "border-gray-700",
    items: [
      "Team workspaces and document collaboration",
      "Public API access for developers",
      "OCR translation — scan in one language, read in another",
      "Enterprise features (SSO, admin controls, compliance)",
    ],
  },
  {
    title: "Done",
    blurb: "Everything we've already shipped",
    dotClass: "bg-emerald-400",
    labelClass: "text-emerald-400",
    borderClass: "border-emerald-400/30",
    items: [
      "Camera capture with auto edge detection, crop, and deskew",
      "Multi-page PDFs generated entirely in your browser — no uploads",
      "Image filters: Auto, B&W, Grayscale, High Contrast, Receipt, Color",
      "OCR — searchable PDFs powered by Tesseract.js",
      "Cloud Sync with Clerk authentication and Uploadthing storage",
      "Document naming with date defaults, folder organization, and full-text search",
      "User profiles with storage meters and plan badges",
      "Pro subscription (Stripe) — unlimited cloud storage, password-protected PDFs, batch scanning, export to Word/Text",
      "Trust pages, SEO landing page, privacy-first design, and analytics",
    ],
  },
];

function Roadmap() {
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

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Roadmap</h1>
        <p className="mt-2 text-gray-400">
          What's on the radar for DocSnap — and what we've already shipped.
          No dates promised, just an honest look at where things are heading.
        </p>

        <div className="mt-10 space-y-6">
          {sections.map((section) => (
            <section
              key={section.title}
              className={`rounded-xl border ${section.borderClass} bg-gray-900/60 p-5 sm:p-6`}
            >
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${section.dotClass}`} />
                <h2 className={`text-lg font-semibold ${section.labelClass}`}>
                  {section.title}
                </h2>
              </div>
              <p className="mt-1 pl-6 text-sm text-gray-500">{section.blurb}</p>
              <ul className="mt-4 space-y-2.5">
                {section.items.map((item) => (
                  <li key={item} className="flex items-baseline gap-2 text-sm text-gray-300">
                    <span className={`shrink-0 ${section.labelClass}`}>▹</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500">
          Have an idea or a suggestion?{" "}
          <a
            href="mailto:support@docsnapapp.com?subject=Roadmap%20suggestion"
            className="text-indigo-400 underline"
          >
            We'd love to hear it
          </a>
          .
        </p>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap — scan documents instantly, right in your browser</span>
      </footer>
    </main>
  );
}
