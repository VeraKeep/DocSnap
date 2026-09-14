import { createFileRoute } from "@tanstack/react-router";
import { MeetingsnapApp } from "~/features/meetingsnap/components/MeetingsnapApp";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/meetingsnap")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "MeetingSnap — DocSnap" }, { name: "description", content: "Turn meeting transcripts into summaries, decisions, action items, owners, questions, and risks — searchable forever." }] }),
  component: MeetingsnapPage,
});

const outcomes = [
  ["Notes", "A clean executive summary of what happened."],
  ["Actions", "Tasks, owners, and due dates surfaced automatically."],
  ["Decisions", "What was decided and the context behind it."],
  ["Follow-ups", "Questions, risks, and unresolved items kept visible."],
];

function MeetingsnapPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="MeetingSnap" title="Capture every meeting." description="Turn transcripts into organized notes, decisions, action items, owners, questions, and follow-ups — automatically." />
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {outcomes.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
              <h2 className="font-bold text-violet-300">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
        <div id="analyze" className="mt-10 rounded-3xl border border-slate-800 bg-slate-950/60 p-4 sm:p-6">
          <div className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Analyze a meeting</p>
            <h2 className="mt-2 text-2xl font-black">From raw transcript to structured knowledge.</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">Paste a transcript or upload an export from Zoom, Microsoft Teams, or Google Meet. Low-confidence items stay flagged for review.</p>
          </div>
          <CheckoutSuccessBanner destination={{ kind: "module", module: "meetingsnap" }} />
          <MeetingsnapApp />
        </div>
      </section>
    </main>
  );
}
