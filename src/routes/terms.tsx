import { canonicalUrl } from "../siteConfig";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: 'Terms of Service — DocSnap © 2026' },
      { name: "description", content: 'Plain-English terms of service for DocSnap © 2026 — a free local document scanner with optional paid subscriptions, paid add-on modules, AI-powered features, and cloud storage.' },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/terms") }],
  }) ,
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
        <p className="mt-2 text-gray-400">Last updated: August 2026</p>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">In plain English</h2>
            <p className="mt-3">
              DocSnap © 2026 is part of the VeraKeep suite. At its core it's a free
              document scanner that runs locally in your browser, with no account
              required. We also offer optional paid subscriptions and paid add-on
              modules that add cloud storage, AI-powered features, and tools for the
              things you own. We don't want to bury you in legalese — here's what you
              need to know, honestly and simply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">What the service is</h2>
            <p className="mt-3">
              DocSnap © 2026 is both a free, local document scanner and a platform you
              can subscribe to. The free scanner — camera capture, image filters,
              multi-page PDFs, and searchable OCR — runs entirely in your browser and
              needs no account. Paid tiers add features such as cloud storage, and paid
              add-on modules (ReceiptSnap, GarageSnap, MeetingSnap, HomeSnap,
              ContractSnap, BillSnap, and BookSnap) add tools for the things you own.
              Paid add-on modules extend your DocSnap account with additional
              capabilities. Modules may be purchased individually or included through an
              eligible bundle.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Subscriptions &amp; recurring billing</h2>
            <p className="mt-3">
              Paid plans and modules are billed by{" "}
              <a href="https://stripe.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Stripe</a>,
              our payment processor, as recurring subscriptions on either a monthly or
              yearly basis, depending on the plan you choose. When you subscribe, you
              authorize us to charge your payment method at the start of each billing
              period until you cancel. We may also offer an "All Access" bundle that
              grants access to multiple add-on modules with a single subscription.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Cancellation &amp; refunds</h2>
            <p className="mt-3">
              You can cancel a paid subscription at any time. Cancellation stops future
              recurring billing — after that, we won't charge you again. You manage and
              cancel your subscription through Stripe's customer portal (linked from
              your DocSnap © 2026 profile). You can also stop using DocSnap © 2026 at
              any time. Refunds for paid plans are handled in accordance with the
              relevant payment processor's policies and the card network rules; we don't
              make promises beyond what our billing processor supports.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">You own your documents</h2>
            <p className="mt-3">
              Anything you scan, import, or create with DocSnap © 2026 is yours. We
              don't claim any ownership, license, or rights over your content. However,
              to provide the cloud and AI features you choose to use, content you submit
              to those features is processed by us and by our AI and storage processors
              (as described in our{" "}
              <Link to="/privacy" className="text-indigo-400 underline">Privacy policy</Link>).
              This is only for the purpose of providing the features you use, and it
              doesn't give us ownership of your content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">AI-generated information</h2>
            <p className="mt-3">
              Some modules use AI to summarize, extract, or analyze content (for
              example, MeetingSnap summaries and action items, or Receipt, Bill, and
              Contract extraction). AI-generated output is provided "as-is" and may
              contain errors or omissions. It is not professional or legal advice, and
              you should verify anything important (contract terms, due dates, amounts,
              decisions) against the original document. Only the content you explicitly
              submit to an AI-powered feature is processed by our AI provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Cloud storage &amp; deletion</h2>
            <p className="mt-3">
              If you use Cloud Sync, your saved documents are stored with a third-party
              provider (Uploadthing) and records are kept on our servers. You can delete
              individual documents yourself at any time. If you want to delete your
              account and all associated data,{" "}
              <Link to="/contact" className="text-indigo-400 underline">contact us</Link>{" "}
              and we'll take care of it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Module services &amp; access</h2>
            <p className="mt-3">
              Paid add-on modules extend your DocSnap account with additional
              capabilities, and may be purchased individually or included through an
              eligible bundle. Your ability to use a module is tied to your subscription
              or add-on ownership. Access is granted based on your
              active subscription and can be removed if that subscription is cancelled
              or lapses. Your plan and which modules you can use are shown in your
              DocSnap © 2026 profile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Acceptable use</h2>
            <p className="mt-3">
              You agree to use DocSnap © 2026 lawfully and respectfully. You may not use
              the service to store or process illegal content, to abuse or harass
              others, to infringe anyone's rights, or to upload or process confidential
              information about other people unless you have the right to do so. You're
              responsible for the content you scan, import, and store.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Account termination</h2>
            <p className="mt-3">
              You may stop using DocSnap © 2026 and close your account at any time. We
              may suspend or terminate accounts that violate these terms, abuse the
              service, or breach the acceptable-use rules above. If we do so, you may
              lose access to cloud-stored content; you should keep your own copies of
              anything important.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Third-party processors</h2>
            <p className="mt-3">
              When you use certain features, your data is handled by the third-party
              services we rely on, each of which has its own terms and privacy policy:
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li><a href="https://clerk.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Clerk</a> — authentication (sign-in).</li>
                <li><a href="https://uploadthing.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Uploadthing</a> — file storage for Cloud Sync.</li>
                <li><a href="https://stripe.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">Stripe</a> — payment processing and subscriptions.</li>
                <li><a href="https://openai.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">OpenAI</a> — AI processing for the AI-powered modules.</li>
                <li>Neon — the hosted Postgres database that stores module records and cloud metadata.</li>
              </ul>
              We're not responsible for the services or practices of these third
              parties. By using the features that rely on them, you agree to their
              terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Service is provided "as-is"</h2>
            <p className="mt-3">
              DocSnap © 2026 is part of the VeraKeep suite and we do our best, but there are no
              guarantees. The service may have bugs, downtime, or limitations.
              We're not liable for any damages resulting from your use of
              DocSnap © 2026, including lost documents or inaccurate AI output.
              (We'd feel terrible about it, but legally we can't take that
              responsibility.)
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">No warranty</h2>
            <p className="mt-3">
              DocSnap © 2026 is distributed in the hope that it will be useful, but
              WITHOUT ANY WARRANTY; without even the implied warranty of
              MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Limitation of liability</h2>
            <p className="mt-3">
              To the fullest extent permitted by law, DocSnap © 2026 and its creators
              shall not be liable for any indirect, incidental, special, or
              consequential damages arising from your use of the service. If
              something goes wrong, our total liability is limited to the
              amount you actually paid for the service in the 12 months
              preceding the claim, or a nominal amount if you paid nothing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Changes to these terms</h2>
            <p className="mt-3">
              If we update these terms, we'll post the new version here with
              an updated date. Significant changes will be noted in the{" "}
              <Link to="/changelog" className="text-indigo-400 underline">changelog</Link>.
              Continuing to use DocSnap © 2026 after changes means you accept the new
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
        <span>DocSnap © 2026 — one place for the important stuff you own and the documents that go with it</span>
      </footer>
    </main>
  );
}
