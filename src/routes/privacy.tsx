import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: 'Privacy — DocSnap © 2026' },
      { name: "description", content: 'DocSnap © 2026 processes all documents locally in your browser — nothing is uploaded unless you choose cloud sync. Read our privacy policy.' },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/privacy" }],
  }) ,
  component: Privacy,
});

function Privacy() {
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

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy</h1>
        <p className="mt-2 text-gray-400">Last updated: July 2026</p>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">Your documents stay on your device</h2>
            <p className="mt-3">
              DocSnap © 2026 processes everything locally in your browser. When you scan a
              document using your camera or import an image from your device, the image
              never leaves your device — it stays right there in your browser tab. We
              don't have servers that receive or store your images.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">What about Cloud Sync?</h2>
            <p className="mt-3">
              Cloud Sync is entirely optional. If you choose to sign in and save a
              document to the cloud, your PDF is uploaded securely using{" "}
              <a href="https://uploadthing.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Uploadthing</a>{" "}
              for file storage. Authentication is handled by{" "}
              <a href="https://clerk.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Clerk</a>.
              Only you can access your saved documents, and you can delete them at any
              time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Privacy-first analytics</h2>
            <p className="mt-3">
              We use{" "}
              <a href="https://plausible.io" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Plausible</a>
              , a privacy-first analytics tool that doesn't use cookies and never
              collects personal data. It helps us understand how many people use
              DocSnap © 2026 and which features are most useful — nothing more.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">OCR is also local</h2>
            <p className="mt-3">
              When you create a searchable PDF, the text recognition (OCR) runs
              entirely in your browser using Tesseract.js. No text is sent to any
              server for processing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3">
              If you have questions about privacy, open an issue on our{" "}
              <a href="https://github.com/myourgal25/docsnapapp" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">GitHub repo</a>.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap © 2026 — everything stays on your device</span>
      </footer>
    </main>
  );
}
