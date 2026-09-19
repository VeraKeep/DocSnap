import { createFileRoute, Link } from "@tanstack/react-router";
import { canonicalUrl } from "~/siteConfig";

export const Route = createFileRoute("/meetingsnap-sales")({
  head: () => ({
    meta: [
      { title: "AI Meeting Summary & Action Item Organizer | MeetingSnap" },
      { name: "description", content: "Turn meeting transcripts into AI summaries, decisions, action items, questions and risks with confidence-aware review in MeetingSnap by DocSnap." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/meetingsnap-sales") }],
  }),
  component: MeetingSnapSalesPage,
});

const BENEFITS = [
  { title: "Turn transcripts into usable records", body: "MeetingSnap structures a transcript into an executive summary, decisions, action items, questions, and risks instead of leaving the conversation buried in a file." },
  { title: "Keep human review in the loop", body: "Extracted decisions, action items, questions, and risks carry confidence information. Low-confidence results are flagged so you can review them against the original transcript." },
  { title: "Start small and scale when you need it", body: "The Free tier supports two meetings per month. Personal and Pro increase capacity and unlock additional features; Team capabilities are still being built." },
];

const FEATURES = [
  "Paste a transcript or upload supported transcript content for analysis.",
  "Extract an executive summary, decisions, action items, questions, and risks.",
  "Capture owners and due dates on action items when the information is present and the tier supports it.",
  "Keep the original transcript as the source of truth while derived analysis remains re-processable.",
  "Search saved meetings; Pro adds AI Q&A and cross-meeting search.",
  "Create follow-up email drafts on supported paid tiers — drafts are never sent automatically.",
];

function MeetingSnapSalesPage() {
  return <main className="flex min-h-screen flex-col bg-gray-950 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/50 px-4 py-4 sm:px-6">
      <Link to="/" className="text-lg font-semibold hover:text-indigo-400">DocSnap</Link>
      <nav className="flex gap-4 text-sm text-gray-400">
        <Link to="/resources" className="hover:text-gray-200">Resources</Link>
        <Link to="/meetingsnap-pricing" className="hover:text-gray-200">Pricing</Link>
        <Link to="/meetingsnap" className="hover:text-gray-200">Open app →</Link>
      </nav>
    </header>

    <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-400">MeetingSnap · a DocSnap module</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Turn meeting transcripts into decisions and next steps.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">MeetingSnap turns a transcript into structured meeting knowledge while preserving the original transcript as the source of truth and flagging uncertain AI results for review.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/meetingsnap-pricing" className="rounded-full bg-indigo-600 px-8 py-3.5 font-semibold hover:bg-indigo-500">See plans — free to start</Link>
          <Link to="/meetingsnap" className="rounded-full border border-gray-700 px-8 py-3.5 font-semibold text-gray-200 hover:border-gray-500">Open MeetingSnap</Link>
        </div>
        <p className="mt-4 text-sm text-gray-500">Free: 2 meetings/month · Personal: 10 · Pro: 40 · Team features coming later</p>
      </div>
    </section>

    <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Why use MeetingSnap?</h2>
        <div className="mt-10 space-y-5">{BENEFITS.map((b)=><article key={b.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6"><h3 className="text-xl font-semibold">{b.title}</h3><p className="mt-3 leading-relaxed text-gray-300">{b.body}</p></article>)}</div>
      </div>
    </section>

    <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">What you can do</h2>
        <ul className="mt-8 space-y-3">{FEATURES.map((f)=><li key={f} className="flex gap-3 text-sm leading-relaxed text-gray-300"><span className="text-indigo-400">✓</span><span>{f}</span></li>)}</ul>
        <div className="mt-10 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 text-sm leading-relaxed text-amber-100">
          <strong>About Team:</strong> shared workspaces, assignments, permissions, organization-wide search, admin controls, and audit logs are planned Team features and are not presented here as currently available.
        </div>
      </div>
    </section>

    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Start with a transcript you already have.</h2>
        <p className="mx-auto mt-4 max-w-xl text-gray-400">The Free tier lets you evaluate the core summary, decision, and action-item workflow before choosing a paid tier.</p>
        <Link to="/meetingsnap-pricing" className="mt-7 inline-flex rounded-full bg-indigo-600 px-8 py-3.5 font-semibold hover:bg-indigo-500">Compare MeetingSnap plans</Link>
        <div className="mt-10 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/resources" className="text-indigo-400 hover:text-indigo-300">Document guides</Link>
          <Link to="/pricing" className="text-gray-400 hover:text-gray-200">DocSnap pricing</Link>
          <Link to="/" className="text-gray-400 hover:text-gray-200">Back to DocSnap</Link>
        </div>
      </div>
    </section>
  </main>;
}
