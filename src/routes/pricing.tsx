import { createFileRoute, Link } from "@tanstack/react-router";
import { useSubscription } from "../hooks/useSubscription";

const PRO_MONTHLY_URL = "https://buy.stripe.com/eVq3cv8yNggzbAw7vTfw400";
const PRO_ANNUAL_URL = "https://buy.stripe.com/4gM00jbKZggzcEA9E1fw401";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: 'Pricing — DocSnap © 2026' },
      { name: "description", content: 'DocSnap © 2026 is free to use. Pro plan ($5/mo) adds unlimited cloud storage, password-protected PDFs, and AI-powered features.' },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/pricing" }],
  }) ,
  component: PricingPage,
});

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0 text-green-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function PricingPage() {
  const { isPro, portalUrl } = useSubscription();
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header / nav */}
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
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
          DocSnap © 2026
        </Link>
        <Link
          to="/"
          className="text-sm text-gray-400 transition hover:text-gray-200"
        >
          ← Back to app
        </Link>
      </header>

      {/* Hero */}
      <section className="px-4 py-16 text-center sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Choose Your Plan
        </h1>
        <p className="mt-4 max-w-md mx-auto text-gray-400 leading-relaxed">
          Upgrade to Pro for unlimited cloud storage, AI-powered features, and
          more. Free tier includes everything you need to get started.
        </p>
      </section>

      {/* Plan cards */}
      <section className="flex flex-1 flex-col items-start justify-center gap-6 px-4 pb-16 sm:flex-row sm:px-6">
        {/* Free */}
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Free</h2>
            <p className="text-sm text-gray-400">
              Everything you need to scan and manage documents.
            </p>
          </div>

          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$0</span>
            <span className="text-sm text-gray-400">/forever</span>
          </div>

          <div className="mt-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300">
              Current Plan
            </span>
          </div>

          <ul className="mt-8 space-y-3">
            {[
              "Unlimited document scanning",
              "OCR & searchable PDFs",
              "Local downloads",
              "Import from photos & camera",
              "25 cloud documents",
              "Basic folder organization",
              "Edge detection & auto-crop",
              "6 image filters (B&W, receipt, etc.)",
              "Multi-page PDFs",
            ].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-sm text-gray-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="w-full max-w-sm rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-6 sm:p-8 ring-2 ring-indigo-500/20">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Pro</h2>
            <p className="text-sm text-gray-400">
              Power features for document power users.
            </p>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">$4.99</span>
              <span className="text-sm text-gray-400">/month</span>
            </div>
            <p className="text-sm text-gray-500">
              or $39.99/year (~$3.33/mo)
            </p>
          </div>

          {isPro && (portalUrl ? <a href={portalUrl} className="mb-3 inline-flex w-full items-center justify-center rounded-full border border-indigo-500 px-6 py-3 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/10">Manage Subscription</a> : <span title="Billing portal coming soon" className="mb-3 inline-flex w-full cursor-not-allowed items-center justify-center rounded-full border border-gray-700 px-6 py-3 text-sm font-semibold text-gray-500">Manage Subscription</span>)}

          <div className="mt-6 flex flex-col gap-3">
            <a
              href={PRO_MONTHLY_URL}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95"
            >
              Subscribe Monthly — $4.99/mo
            </a>
            <a
              href={PRO_ANNUAL_URL}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-500 bg-indigo-600/10 px-6 py-3 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-600/30 active:scale-95"
            >
              Subscribe Annually — $39.99/yr
              <span className="inline-flex items-center rounded-full bg-indigo-600/30 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                Save 33%
              </span>
            </a>
          </div>

          <ul className="mt-8 space-y-3">
            <li className="flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0 text-indigo-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              <span className="text-sm font-medium text-indigo-300">
                Everything in Free, plus:
              </span>
            </li>
            {[
              "Unlimited cloud storage",
              "Synced across all your devices",
              "Document version history",
              "Password-protected PDFs",
              "AI document summaries",
              "AI categorization",
              "Batch scanning & OCR",
              "Priority processing",
              "Premium filters",
              "Export to Word / Text",
              "Email support",
            ].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-sm text-gray-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-center">
            Frequently Asked Questions
          </h2>

          <div className="mt-10 space-y-8">
            {[
              {
                q: "Can I cancel anytime?",
                a: "Yes — you can cancel your Pro subscription at any time from your Stripe billing portal. Your Pro features remain active until the end of your current billing period.",
              },
              {
                q: "What happens to my documents if I downgrade?",
                a: "Your documents remain safe. If you exceed the free tier's 25-document limit after downgrading, you won't be able to save new documents until you remove some or upgrade again. Existing documents remain accessible for download.",
              },
              {
                q: "Do I need a credit card to start?",
                a: "Nope! The Free tier requires no payment method. You only need a card when you choose to upgrade to Pro.",
              },
            ].map((faq) => (
              <div key={faq.q}>
                <h3 className="font-semibold text-gray-200">{faq.q}</h3>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
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
        <Link to="/pricing" className="transition hover:text-indigo-400">
          Pricing
        </Link>
      </footer>
    </main>
  );
}
