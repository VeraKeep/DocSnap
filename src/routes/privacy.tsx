import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: 'Privacy — DocSnap © 2026' },
      { name: "description", content: 'How DocSnap © 2026 handles your data: your documents are processed locally in your browser by default, and we clearly explain what happens when you use Cloud Sync or our AI-powered paid modules.' },
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
        <p className="mt-2 text-gray-400">Last updated: August 2026</p>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">The short version</h2>
            <p className="mt-3">
              DocSnap © 2026 has three ways of handling your documents, and we want to
              be clear about each one. By default, scanning and document processing
              happen <span className="text-white">entirely in your browser</span> and
              your images never leave your device. When you sign in and choose to save
              documents to the cloud, those documents are stored for you by a
              third-party provider and only you can access them. And some paid
              modules (&amp; AI features) send the content you give them to our servers,
              and in some cases to our AI provider, for processing — we cover that
              below too.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">1. Local processing (default, no account)</h2>
            <p className="mt-3">
              When you use DocSnap © 2026 without signing in — scanning a document with
              your camera, importing an image from your device, cropping and deskewing
              it, applying filters, running OCR (text recognition), and generating your
              PDF — everything runs locally in your browser using your device's own
              processing. Your images and documents{" "}
              <span className="text-white">do not leave your device</span>. Text
              recognition uses Tesseract.js, which runs entirely in your browser, so no
              text is sent to a server. Automatic document-naming suggestions are also
              generated on your device from the scanned text.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Cloud storage (optional, signed in)</h2>
            <p className="mt-3">
              Cloud Sync is entirely optional and only happens when you sign in and
              actively choose to save a document to the cloud. If you use it, your
              PDF is stored with{" "}
              <a href="https://uploadthing.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Uploadthing</a>,
              a third-party file-storage provider, and a record of your saved documents
              (with limited metadata such as the file name and page count) is kept on
              our servers. Authentication is handled by{" "}
              <a href="https://clerk.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Clerk</a>.
              Only you can access your saved documents, and you can delete them — and
              their records on our servers — at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. AI &amp; advanced processing (paid modules &amp; cloud features)</h2>
            <p className="mt-3">
              Some DocSnap modules use AI and server-side processing to understand the
              content you give them. When you use these features, the content you
              submit is sent to our servers and processed by our AI provider (OpenAI)
              to produce the results you see. This applies to:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>
                <span className="text-white">MeetingSnap</span> — meeting transcripts
                (and, for audio, recordings after transcription) are analyzed by AI to
                produce summaries, decisions, action items, and questions. AI is also
                used to answer questions about your saved meetings and draft follow-up
                email text. Your meetings and their results are stored on our servers
                so you can access them later.
              </li>
              <li>
                <span className="text-white">ReceiptSnap</span> — receipt images and
                text are processed by AI to extract the merchant, date, and amount.
              </li>
              <li>
                <span className="text-white">BillSnap</span> — bill images and PDFs are
                processed by AI to extract the vendor, amount due, and due date.
              </li>
              <li>
                <span className="text-white">ContractSnap</span> — contract documents
                are processed by AI to summarize key terms, deadlines, and obligations.
              </li>
            </ul>
            <p className="mt-3">
              Several other modules focus on organizing and storing your own records
              rather than AI analysis: for example, HomeSnap, GarageSnap, and BookSnap
              store the records and notes you create on our servers (so they sync
              across your devices) but do not send your content to an AI provider. And
              some processing always stays on your device — such as duplicate detection
              and the local document-naming heuristics in the core scanner.
            </p>
            <p className="mt-3">
              In short: <span className="text-white">without an account, nothing leaves
              your device</span>; with Cloud Sync, the files you choose to save are
              stored for you and only you can access them; and when you use an
              AI-powered module, the content you submit to that module is processed by
              our servers and our AI provider. Only the content you actually submit to
              those features is processed in this way.
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
        <span>DocSnap © 2026 — your documents are processed locally by default; we're transparent about what happens in the cloud</span>
      </footer>
    </main>
  );
}
