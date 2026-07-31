import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
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

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-gray-400">Last updated: July 2026</p>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">In plain English</h2>
            <p className="mt-3">
              DocSnap is a free tool that runs in your browser. We don't want to
              bury you in legalese — here's what you need to know, honestly and
              simply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">You own your documents</h2>
            <p className="mt-3">
              Anything you scan, import, or create with DocSnap is yours. We
              don't claim any ownership, license, or rights over your content.
              When you save a document to Cloud Sync, you're just storing it —
              we don't look at it, analyze it, or use it for anything.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Service is provided "as-is"</h2>
            <p className="mt-3">
              DocSnap is a side project and we do our best, but there are no
              guarantees. The service may have bugs, downtime, or limitations.
              We're not liable for any damages resulting from your use of
              DocSnap, including lost documents. (We'd feel terrible about it,
              but legally we can't take that responsibility.)
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Cloud Sync uses third-party services</h2>
            <p className="mt-3">
              Cloud Sync is optional and powered by{" "}
              <a href="https://clerk.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Clerk</a>{" "}
              for authentication and{" "}
              <a href="https://uploadthing.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Uploadthing</a>{" "}
              for file storage. Those services have their own terms and privacy
              policies. If you choose to use Cloud Sync, you're also agreeing
              to their terms. We're not responsible for their services or
              practices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">No warranty</h2>
            <p className="mt-3">
              DocSnap is distributed in the hope that it will be useful, but
              WITHOUT ANY WARRANTY; without even the implied warranty of
              MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Limitation of liability</h2>
            <p className="mt-3">
              To the fullest extent permitted by law, DocSnap and its creators
              shall not be liable for any indirect, incidental, special, or
              consequential damages arising from your use of the service. If
              something goes wrong, our total liability is limited to the
              amount you paid us — which is zero, since the service is free.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Changes to these terms</h2>
            <p className="mt-3">
              If we update these terms, we'll post the new version here with
              an updated date. Significant changes will be noted in the{" "}
              <Link to="/changelog" className="text-indigo-400 underline">changelog</Link>.
              Continuing to use DocSnap after changes means you accept the new
              terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3">
              Questions about these terms?{" "}
              <Link to="/contact" className="text-indigo-400 underline">Get in touch</Link>.
            </p>
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
