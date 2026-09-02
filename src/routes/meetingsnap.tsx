import { createFileRoute, Link } from "@tanstack/react-router";
import { MeetingsnapApp } from "~/features/meetingsnap/components/MeetingsnapApp";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";

export const Route = createFileRoute("/meetingsnap")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "MeetingSnap — DocSnap" },
      {
        name: "description",
        content:
          "Turn any meeting transcript into decisions, action items, and owners — searchable forever. AI extracts the executive summary, decisions, action items, questions, and risks, each with a confidence score. Sign in required.",
      },
    ],
  }),
  component: MeetingsnapPage,
});

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2Z" />
        <path d="m18 15-3-3 3-3" stroke="#a5b4fc" />
      </svg>
    </div>
  );
}

const steps = [
  {
    title: "Upload a transcript",
    body: "Paste a meeting transcript or drop in a TXT export — from Zoom, Microsoft Teams, or Google Meet. No setup and no recording required.",
  },
  {
    title: "AI extracts the structure",
    body: "The executive summary, decisions, action items with owners and due dates, questions, and risks — each surfaced with a confidence score.",
  },
  {
    title: "Search, share, and follow up",
    body: "Every meeting becomes searchable organizational knowledge. Save it, reopen it, and act on what was decided.",
  },
];

const outputs = [
  {
    title: "Executive summary",
    body: "A short brief of what happened and what matters.",
  },
  {
    title: "Decisions",
    body: "What was decided, with the context that led there.",
  },
  {
    title: "Action items",
    body: "Every task with its owner and due date, ready to track.",
  },
  {
    title: "Questions",
    body: "Open questions and things left unresolved.",
  },
  {
    title: "Risks",
    body: "Concerns and blockers, surfaced early instead of later.",
  },
];

const audiences = [
  {
    title: "Professionals & managers",
    body: "Keep every decision and owner from your meetings — no more wondering whether something was ever decided.",
  },
  {
    title: "Small-business teams",
    body: "Sales, marketing, engineering, and ops teams that move fast and need to stay aligned across functions.",
  },
  {
    title: "Consultants",
    body: "Clean minutes and clear action lists for every client engagement, without the manual cleanup.",
  },
  {
    title: "Researchers",
    body: "Searchable records of discussions across projects, collaborators, and long-running threads.",
  },
];

/**
 * MeetingSnap module entry: /meetingsnap renders the public landing copy
 * (hero, how-it-works, what-you-get, trust, who-it's-for) with a CTA that
 * starts the upload/analyze flow on the same route, in DocSnap's dark
 * gray/indigo treatment. The root shell supplies the Clerk provider and footer.
 */
function MeetingsnapPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <Logo />
          DocSnap
        </Link>
        <Link to="/scan" className="text-sm text-gray-400 transition hover:text-gray-200">
          ← Back to app
        </Link>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-gray-800/50"
        style={{
          background:
            "radial-gradient(60rem 30rem at 50% -5rem, rgb(99 102 241 / 0.12), transparent 60%)",
        }}
      >
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-900 bg-indigo-950/60 px-4 py-1.5 text-sm font-medium text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
            MeetingSnap · AI meeting intelligence
          </p>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">
            Turn any meeting transcript into decisions, action items, and owners —{" "}
            <span className="text-indigo-400">searchable forever.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
            MeetingSnap reads your raw transcripts and extracts what was decided,
            who owns it, and what changed — so every meeting becomes lasting
            organizational knowledge, not a forgotten file.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#analyze"
              className="w-full rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500 sm:w-auto"
            >
              Analyze a transcript
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-8 py-3.5 text-base font-semibold text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-800 sm:w-auto"
            >
              How it works
            </a>
          </div>
          <p className="mt-8 text-sm text-gray-500">
            TXT · Zoom, Teams, and Google Meet exports · or paste a transcript
          </p>
        </div>
      </section>

      {/* Analyzer */}
      <section id="analyze" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-14 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-indigo-400">What was decided? Who owns it? What changed?</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Analyze a meeting now
          </h2>
          <p className="mt-3 text-gray-400">
            Paste a transcript or upload a TXT export, and get the structured
            breakdown instantly. Low-confidence items are flagged for review.
          </p>
        </div>
        <CheckoutSuccessBanner destination={{ kind: "module", module: "meetingsnap" }} />
        <MeetingsnapApp />
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-gray-800/50 bg-gray-900/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-medium text-indigo-400">How it works</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              From raw transcript to structured knowledge in three steps
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-400">
              Upload or paste what you already have — a meeting export or a
              transcript — and let AI do the organizing.
            </p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-gray-800 bg-gray-900 p-8"
              >
                <span
                  className="absolute right-6 top-6 text-5xl font-bold text-gray-800"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-950 text-indigo-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-gray-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you get */}
      <section id="what-you-get" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-medium text-indigo-400">What you get</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Every meeting&apos;s structure, extracted
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-400">
              For each meeting you get a clean, reviewable breakdown you can act on.
            </p>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {outputs.map((item) => (
              <li
                key={item.title}
                className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6"
              >
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="scroll-mt-20 border-y border-gray-800/50 bg-gray-900/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-medium text-indigo-400">Trusted, not just generated</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              AI does the work. People stay in control.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8">
              <h3 className="text-lg font-semibold text-white">Low confidence is flagged, not assumed</h3>
              <p className="mt-2 leading-relaxed text-gray-400">
                Every extraction carries a confidence score. Uncertain owners,
                deadlines, and commitments are flagged for human confirmation
                before they become authoritative records.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8">
              <h3 className="text-lg font-semibold text-white">Evidence is preserved</h3>
              <p className="mt-2 leading-relaxed text-gray-400">
                The original transcript is always the source of truth. The
                extracted structure is derived data — versioned, reviewable, and
                re-processable as models improve.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-medium text-indigo-400">Who it&apos;s for</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Built for people whose decisions matter
            </h2>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {audiences.map((audience) => (
              <li
                key={audience.title}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-6"
              >
                <h3 className="font-semibold text-white">{audience.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{audience.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
