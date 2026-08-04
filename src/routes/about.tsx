import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: 'About — DocSnap' },
      { name: "description", content: 'DocSnap is a privacy-first document scanner built by a solo developer. No accounts, no uploads, no Adobe license required.' },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/about" }],
  }) ,
  component: About,
});

function About() {
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

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 64 64">
              <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="#fff" strokeWidth="3"/>
              <path d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">About DocSnap</h1>
          </div>
        </div>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">What is DocSnap?</h2>
            <p className="mt-3">
              DocSnap is a free, browser-based document scanner. Point your camera at a
              document and get a clean, downloadable PDF — instantly. No accounts, no
              uploads, no Adobe license required. Everything runs locally in your
              browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Tech stack</h2>
            <p className="mt-3">
              DocSnap is built with modern web technologies and open-source libraries:
            </p>
            <ul className="mt-4 space-y-2">
              {[
                { name: "React 19", what: "UI framework" },
                { name: "TanStack Start", what: "Full-stack framework" },
                { name: "Vite", what: "Build tool" },
                { name: "Tailwind CSS v4", what: "Styling" },
                { name: "Tesseract.js", what: "OCR engine for searchable PDFs" },
                { name: "jsPDF", what: "PDF generation" },
                { name: "MediaDevices API", what: "Camera access" },
                { name: "Canvas API", what: "Image processing & document detection" },
                { name: "Clerk", what: "Optional authentication for Cloud Sync" },
                { name: "Uploadthing", what: "Optional cloud file storage" },
                { name: "sharp", what: "App icon generation" },
              ].map((item) => (
                <li key={item.name} className="flex items-baseline gap-2">
                  <span className="shrink-0 text-indigo-400">▹</span>
                  <span>
                    <strong className="font-medium text-white">{item.name}</strong>
                    <span className="ml-1.5 text-sm text-gray-500">{item.what}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Open source</h2>
            <p className="mt-3">
              DocSnap is open source. Check out the code, report issues, or contribute
              on{" "}
              <a href="https://github.com/myourgal25/docsnapapp" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">GitHub</a>.
            </p>
          </section>

          <section className="pt-4">
            <p className="text-2xl">Built with ❤️</p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap — scan documents instantly, right in your browser</span>
      </footer>
    </main>
  );
}
