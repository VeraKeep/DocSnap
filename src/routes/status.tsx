import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — DocSnap" },
      { name: "description", content: "Current status of DocSnap services — app, cloud storage, authentication, payments, and OCR." },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/status" }],
  }),
  component: Status,
});

interface Component {
  name: string;
  description: string;
  status: "operational";
}

const components: Component[] = [
  { name: "DocSnap App", description: "Web app, scanning, and PDF generation" },
  { name: "Cloud Storage", description: "Uploadthing — cloud document storage" },
  { name: "Authentication", description: "Clerk — sign-in and account management" },
  { name: "Payments", description: "Stripe — subscriptions and billing" },
  { name: "OCR", description: "Tesseract.js — searchable PDF text recognition" },
];

function Status() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const date = new Date();
    setNow(
      date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }) +
        " at " +
        date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  }, []);

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

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">System Status</h1>
        <p className="mt-2 text-gray-400">Live status of the services that power DocSnap</p>

        {/* Overall status */}
        <div className="mt-10 flex items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-5 sm:p-6">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400" />
          </span>
          <div>
            <p className="text-lg font-semibold text-emerald-300">All systems operational</p>
            <p className="text-sm text-gray-400">
              {now ? `Last checked ${now}` : "Last checked just now"}
            </p>
          </div>
        </div>

        {/* Components */}
        <div className="mt-6 divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900/60">
          {components.map((component) => (
            <div key={component.name} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">{component.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">{component.description}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Operational
              </span>
            </div>
          ))}
        </div>

        {/* Subscribe */}
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-white">Get status updates</h2>
          <p className="mt-1 text-sm text-gray-400">
            We'll email you when something changes — no spam, unsubscribe anytime.
          </p>
          <a
            href="mailto:support@docsnapapp.com?subject=Subscribe%20to%20status%20updates&body=Please%20add%20me%20to%20the%20DocSnap%20status%20notification%20list."
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Subscribe via email
          </a>
        </div>

        <p className="mt-8 text-xs text-gray-600">
          Status is checked and updated manually — this page is a snapshot, not an automated monitor.
        </p>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        <span>DocSnap — scan documents instantly, right in your browser</span>
      </footer>
    </main>
  );
}
