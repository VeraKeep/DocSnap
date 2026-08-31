import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * /meetingsnap-sales — public sales/landing page for MeetingSnap, the
 * PREMIUM, tiered add-on inside DocSnap (Free / Personal / Pro / Team).
 * Modeled on the HomeSnap sales page layout. Because MeetingSnap is tiered
 * rather than a flat monthly/yearly add-on, the price block routes to the
 * existing /meetingsnap-pricing page (which holds the real tier plans and
 * their existing Stripe checkout wiring) instead of a single Buy link.
 */
export const Route = createFileRoute("/meetingsnap-sales")({
  head: () => ({
    meta: [
      { title: "MeetingSnap — DocSnap" },
      {
        name: "description",
        content:
          "MeetingSnap — the premium, tiered AI add-on inside DocSnap. Turn any meeting transcript into summaries, decisions, and action items, searchable forever. Free / Personal / Pro / Team.",
      },
    ],
  }),
  component: MeetingSnapSalesPage,
});

function Logo() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg">🎙️</span>;
}

const BENEFITS: { title: string; body: string }[] = [
  {
    title: "Turn any meeting into lasting knowledge",
    body: "A raw transcript is just a file. MeetingSnap reads it and extracts what was decided, who owns it, and what changed — so every meeting becomes a searchable record you can act on, not a transcript nobody reopens.",
  },
  {
    title: "Know who owns what, and when it's due",
    body: "Action items, owners, and due dates get pulled out of the conversation with a confidence score. Low-confidence items are flagged for review, so the record stays trustworthy instead of assuming.",
  },
  {
    title: "The premium, tiered add-on — sized to how you work",
    body: "MeetingSnap is the one premium module inside DocSnap, with Free, Personal, Pro, and Team tiers. Start free, and move up when you need more meetings, more AI, or team-wide search.",
  },
];

const FEATURES: string[] = [
  "Upload a transcript or paste one — from Zoom, Microsoft Teams, or Google Meet exports — no recording or setup required.",
  "AI extracts the executive summary, decisions, action items with owners and due dates, questions, and risks.",
  "Every extraction carries a confidence score; uncertain items are flagged for human confirmation.",
  "Search across your meetings and reopen any record — every analysis is saved, versioned, and re-processable.",
  "Start free with 2 meetings a month, or choose Personal, Pro, or Team to scale up.",
];

function MeetingSnapSalesPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <Logo />
          DocSnap
        </Link>
        <Link to="/meetingsnap" className="text-sm text-gray-400 transition hover:text-gray-200">
          Open the app →
        </Link>
      </header>

      {/* Hero */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-900 bg-indigo-950/60 px-4 py-1.5 text-sm font-medium text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
            MeetingSnap · the premium, tiered AI add-on inside DocSnap
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Turn any meeting transcript into action items — searchable forever.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            MeetingSnap reads your raw transcripts and extracts the executive summary, decisions,
            action items, questions, and risks — each with a confidence score. Every meeting
            becomes lasting organizational knowledge, not a forgotten file.
          </p>
          <div className="mt-8">
            <Link
              to="/meetingsnap-pricing"
              className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
            >
              See plans & pricing — free to start
            </Link>
            <p className="mt-3 text-sm text-gray-400">Free · Personal · Pro · Team</p>
          </div>
          <p className="mt-5 text-xs text-gray-600">
            The premium tiered add-on inside your DocSnap account. Start free, no credit card
            required.
          </p>
        </div>
      </section>

      {/* Benefit sections */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Why summarize your meetings?
          </h2>
          <div className="mt-10 space-y-8">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
                <h3 className="text-xl font-semibold">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-300">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can do — feature rundown */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">What you can do</h2>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-gray-300">
                <span className="mt-0.5 text-indigo-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tier block */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            One premium add-on, sized to how you work
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-400">
            MeetingSnap is the one premium, tiered add-on inside DocSnap — not a flat monthly fee.
            Start free, and choose the tier that matches how many meetings you run.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
              <p className="text-sm font-medium text-gray-400">Start free</p>
              <p className="mt-3 text-4xl font-bold">
                $0
                <span className="text-base font-normal text-gray-400">/month</span>
              </p>
              <p className="mt-3 text-sm text-gray-400">2 meetings a month, forever.</p>
              <p className="mt-1 text-sm text-gray-300">Free tier, no card required</p>
              <Link
                to="/meetingsnap-pricing"
                className="mt-6 inline-flex justify-center rounded-full border border-indigo-500 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-600/20"
              >
                Start free
              </Link>
            </div>
            <div className="flex flex-col rounded-2xl border border-indigo-700/60 bg-indigo-950/30 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-indigo-300">Personal · Pro · Team</p>
                <span className="rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs font-medium text-indigo-200">
                  tiered
                </span>
              </div>
              <p className="mt-3 text-4xl font-bold">
                From $5.99
                <span className="text-base font-normal text-gray-400">/month</span>
              </p>
              <p className="mt-2 text-sm text-gray-400">More meetings, full AI, up to team-wide search.</p>
              <p className="mt-1 text-sm text-gray-300">Compare the tiers and pick yours</p>
              <Link
                to="/meetingsnap-pricing"
                className="mt-6 inline-flex justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                See plans & pricing
              </Link>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-sm text-gray-400">
            Free / Personal / Pro / Team. <span className="text-gray-500">Cancel anytime.</span>
          </p>
        </div>
      </section>

      {/* Final CTA + microcopy */}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Link
            to="/meetingsnap-pricing"
            className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
          >
            See plans & pricing — free to start
          </Link>
          <p className="mt-3 text-sm text-gray-400">
            Already have a transcript? Paste it into the app and see the analysis.
          </p>
          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-left">
            <p className="text-sm leading-relaxed text-gray-300">
              <span className="font-semibold text-gray-100">Not sure where to start?</span> Free is
              the easiest way in — upload a transcript and see the executive summary, decisions, and
              action items before you pay anything. Move up when you need more.
            </p>
          </div>
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-gray-500">
            <Link to="/meetingsnap" className="transition hover:text-gray-300">
              Open the app →
            </Link>
            <span>·</span>
            <Link to="/" className="transition hover:text-gray-300">Back to DocSnap</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/pricing" className="transition hover:text-gray-400">Pricing</Link>
        <Link to="/privacy" className="transition hover:text-gray-400">Privacy</Link>
        <Link to="/terms" className="transition hover:text-gray-400">Terms</Link>
        <Link to="/contact" className="transition hover:text-gray-400">Contact</Link>
      </footer>
    </main>
  );
}
