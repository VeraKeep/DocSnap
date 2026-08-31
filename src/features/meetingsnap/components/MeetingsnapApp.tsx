import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  analyzeAudio,
  analyzeMeeting,
  askAI,
  draftFollowUpEmail,
  getMeeting,
  listMeetings,
  searchMeetings,
} from "../server";
import { uploadAudioRecording } from "../../../cloudSync";
import {
  actionListToMarkdown,
  downloadText,
  formatTimestamp,
  meetingToMarkdown,
  meetingToPdf,
} from "./exporters";
import {
  isLowConfidence,
  type AskAIResult,
  type FollowUpDraft,
  type MeetingActionItem,
  type MeetingDecision,
  type MeetingDetail,
  type MeetingExtraction,
  type MeetingQuestion,
  type MeetingRisk,
  type MeetingSearchResult,
  type MeetingSegment,
  type MeetingSummary,
} from "../types";
import { extractFileText } from "../textExtract";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/* Text extraction for uploaded files (TXT / PDF / DOCX) lives in
   ../textExtract.ts - reads real text out of .pdf/.docx and feeds
   the SAME analyze -> AI-extraction -> persist pipeline unchanged. */

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */
function ConfidenceTag({ confidence, label }: { confidence: number; label?: string }) {
  const low = isLowConfidence(confidence);
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        low ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300",
      ].join(" ")}
      title={`Confidence ${(confidence * 100).toFixed(0)}%`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${low ? "bg-amber-400" : "bg-emerald-400"}`}
        aria-hidden="true"
      />
      {label ?? `${(confidence * 100).toFixed(0)}%`}
    </span>
  );
}

function ReviewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
      ⚠ Review — low confidence
    </span>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">
      {text}
    </p>
  );
}

/**
 * Best-effort match between an extracted item's text and a timestamped
 * transcript segment. Items are AI paraphrases, not verbatim quotes, so this
 * uses keyword overlap (meaningful, non-stopword tokens). Returns the segment
 * with the most shared tokens, or null when there's no real overlap. Any
 * segment that shares at least one meaningful word is considered a match.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", "while",
  "with", "without", "for", "to", "from", "of", "in", "on", "at", "by", "we",
  "you", "i", "me", "my", "our", "us", "they", "them", "he", "she", "it",
  "this", "that", "these", "those", "will", "would", "should", "could", "can",
  "want", "need", "get", "got", "make", "like", "really", "just", "about",
  "into", "over", "all", "do", "does", "did", "is", "are", "was", "were", "be",
]);
function meaningfulTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const t = raw.replace(/^'+|'+$/g, "");
    if (t.length >= 4 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}
function matchingSegment(
  segments: MeetingSegment[],
  text: string,
): MeetingSegment | null {
  if (!segments.length) return null;
  const itemTokens = meaningfulTokens(text);
  if (!itemTokens.size) return null;
  let best: MeetingSegment | null = null;
  let bestOverlap = 0;
  for (const seg of segments) {
    const segTokens = meaningfulTokens(seg.text);
    let overlap = 0;
    segTokens.forEach((t) => {
      if (itemTokens.has(t)) overlap += 1;
    });
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = seg;
    }
  }
  return bestOverlap > 0 ? best : null;
}

/** Small speaker-attribution badge on extracted items (empty in stepping stone). */
function SpeakerBadge({
  speaker,
  unverified,
}: {
  speaker: string | null;
  unverified: boolean;
}) {
  if (!speaker) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        unverified ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/15 text-sky-300"
      }`}
      title={unverified ? "Speaker attribution is uncertain — review" : `Attributed to ${speaker}`}
    >
      {speaker}
      {unverified ? " · Review" : ""}
    </span>
  );
}

/** Jump-to-timestamp button shown on items that map to a transcript segment. */
function SegmentJumpButton({
  segment,
  onJump,
}: {
  segment: MeetingSegment | null;
  onJump?: (segment: MeetingSegment) => void;
}) {
  if (!segment || !onJump) return null;
  return (
    <button
      type="button"
      onClick={() => onJump(segment)}
      title={`Jump to ${formatTimestamp(segment.start_sec)} in the transcript`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 transition hover:bg-indigo-500/30"
    >
      ⏱ {formatTimestamp(segment.start_sec)}
    </button>
  );
}

function ActionItemCard({
  item,
  segment,
  onJump,
}: {
  item: MeetingActionItem;
  segment?: MeetingSegment | null;
  onJump?: (segment: MeetingSegment) => void;
}) {
  const low = isLowConfidence(item.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{item.task}</span>
        <div className="flex items-center gap-2">
          <SpeakerBadge speaker={item.speaker} unverified={item.speakerUnverified} />
          {low ? <ReviewBadge /> : <ConfidenceTag confidence={item.confidence} />}
          <SegmentJumpButton segment={segment ?? null} onJump={onJump} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-gray-600">Owner</dt>
          <dd className="mt-0.5 text-gray-300">{item.owner ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Priority</dt>
          <dd className="mt-0.5 capitalize text-gray-300">{item.priority ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Due date</dt>
          <dd className="mt-0.5 text-gray-300">{item.due_date ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Status</dt>
          <dd className="mt-0.5 text-gray-300">{item.status ?? "—"}</dd>
        </div>
      </dl>
      {item.dependencies.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">Depends on: {item.dependencies.join(", ")}</p>
      )}
    </li>
  );
}

function DecisionCard({
  d,
  segment,
  onJump,
}: {
  d: MeetingDecision;
  segment?: MeetingSegment | null;
  onJump?: (segment: MeetingSegment) => void;
}) {
  const low = isLowConfidence(d.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{d.decision}</span>
        <div className="flex items-center gap-2">
          <SpeakerBadge speaker={d.speaker} unverified={d.speakerUnverified} />
          {low ? <ReviewBadge /> : <ConfidenceTag confidence={d.confidence} />}
          <SegmentJumpButton segment={segment ?? null} onJump={onJump} />
        </div>
      </div>
      {d.reason ? <p className="mt-2 text-sm text-gray-400">{d.reason}</p> : null}
      {d.participants.length > 0 ? (
        <p className="mt-2 text-xs text-gray-500">Participants: {d.participants.join(", ")}</p>
      ) : null}
    </li>
  );
}

function QuestionCard({ q }: { q: MeetingQuestion }) {
  const low = isLowConfidence(q.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{q.question}</span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              q.answered ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-800 text-gray-300"
            }`}
          >
            {q.answered ? "Answered" : "Open"}
          </span>
          {low ? <ReviewBadge /> : <ConfidenceTag confidence={q.confidence} />}
        </div>
      </div>
    </li>
  );
}

function RiskCard({
  r,
  segment,
  onJump,
}: {
  r: MeetingRisk;
  segment?: MeetingSegment | null;
  onJump?: (segment: MeetingSegment) => void;
}) {
  const low = isLowConfidence(r.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{r.description}</span>
        <div className="flex items-center gap-2">
          <SpeakerBadge speaker={r.speaker} unverified={r.speakerUnverified} />
          {low ? <ReviewBadge /> : <ConfidenceTag confidence={r.confidence} />}
          <SegmentJumpButton segment={segment ?? null} onJump={onJump} />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Likelihood: <span className="capitalize text-gray-300">{r.likelihood ?? "—"}</span> · Impact:{" "}
        <span className="capitalize text-gray-300">{r.impact ?? "—"}</span>
        {r.owner ? <> · Owner: {r.owner}</> : null}
      </p>
      {r.mitigation ? <p className="mt-1 text-sm text-gray-400">Mitigation: {r.mitigation}</p> : null}
    </li>
  );
}

function safeFilename(title: string): string {
  return (title || "meeting").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "meeting";
}

function ExportToolbar({ meeting }: { meeting: MeetingDetail }) {
  const base = safeFilename(meeting.title);
  const [poof, setPoof] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [draftState, setDraftState] = useState<
    "idle" | "busy" | "not-enabled" | "none-open" | "ready"
  >("idle");
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-gray-200">Export</span>
        <button
          type="button"
          onClick={() => {
            downloadText(meetingToMarkdown(meeting), `${base}-minutes.md`, "text/markdown;charset=utf-8");
            setPoof(true);
            window.setTimeout(() => setPoof(false), 1500);
          }}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-indigo-500"
        >
          Minutes (.md)
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(actionListToMarkdown(meeting), `${base}-actions.md`, "text/markdown;charset=utf-8")
          }
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-indigo-500"
        >
          Action list (.md)
        </button>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            setExportError("");
            try {
              const blob = await meetingToPdf(meeting);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${base}-minutes.pdf`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (e) {
              setExportError(messageFromError(e, "PDF export failed."));
            } finally {
              setPdfBusy(false);
            }
          }}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-indigo-500 disabled:opacity-50"
        >
          {pdfBusy ? "Building PDF…" : "Minutes (.pdf)"}
        </button>

        <span className="mx-2 h-4 w-px bg-gray-700" aria-hidden="true" />

        <button
          type="button"
          disabled={draftState === "busy"}
          onClick={async () => {
            setDraftState("busy");
            setDraft(null);
            try {
              const res = await draftFollowUpEmail({ data: { id: meeting.id } });
              if (!res.configured) {
                setDraftState("not-enabled");
              } else if (res.noneOpen) {
                setDraftState("none-open");
              } else if (res.draft) {
                setDraft(res.draft);
                setDraftState("ready");
              } else {
                setDraftState("idle");
              }
            } catch (e) {
              setExportError(messageFromError(e, "Could not draft the follow-up email."));
              setDraftState("idle");
            }
          }}
          className="rounded-lg border border-indigo-600 bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-600/30 disabled:opacity-50"
        >
          {draftState === "busy" ? "Drafting…" : "Draft follow-up email"}
        </button>
      </div>

      {exportError && (
        <p role="alert" className="mt-3 text-xs text-red-300">{exportError}</p>
      )}
      {poof && <p role="status" className="mt-3 text-xs text-emerald-300">Downloaded your meeting minutes.</p>}

      {draftState === "not-enabled" && (
        <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Follow-up email drafting isn't enabled yet — the AI backend (OPENAI_API_KEY) isn't connected. Drafts
          are never sent automatically; ask the team to connect AI and this will appear as a copyable draft.
        </p>
      )}
      {draftState === "none-open" && (
        <p className="mt-3 text-sm text-gray-400">
          This meeting has no open action items, so there's nothing to follow up on.
        </p>
      )}
      {draft && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">Follow-up email draft</p>
            <p className="text-xs text-gray-500">A draft only — review before sending.</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Subject</p>
            <input
              value={draft.subject}
              onChange={(e) => setDraft((d) => (d ? { ...d, subject: e.target.value } : d))}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Body (copy &amp; edit)</p>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs leading-relaxed text-gray-300 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {copied ? "Copied!" : "Copy draft"}
            </button>
            <p className="text-xs text-gray-600">This is never emailed automatically.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsView({ meeting }: { meeting: MeetingDetail }) {
  const ex: MeetingExtraction = meeting.extraction;
  const segments = ex.segments ?? [];
  const [transcriptView, setTranscriptView] = useState<"raw" | "segments">(
    segments.length ? "segments" : "raw",
  );
  const [highlightStart, setHighlightStart] = useState<number | null>(null);
  const segRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Jump from an item card to the timestamped segment that voiced it: switch to
  // the timestamp view (if needed), then scroll to + highlight that segment.
  const jumpTo = useCallback((seg: MeetingSegment) => {
    setTranscriptView("segments");
    setHighlightStart(seg.start_sec);
    window.setTimeout(() => {
      segRefs.current.get(seg.start_sec)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    // Clear the highlight after a few seconds.
    window.setTimeout(() => setHighlightStart(null), 4000);
  }, []);

  const viewBtn = (v: "raw" | "segments", label: string) => (
    <button
      type="button"
      onClick={() => setTranscriptView(v)}
      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
        transcriptView === v
          ? "bg-indigo-600 text-white"
          : "text-gray-300 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-8 space-y-8">
      <ExportToolbar meeting={meeting} />

      {/* Transcript with raw/timestamp view toggle + jump-to-timestamp */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-200">Transcript</h3>
          {segments.length > 0 && (
            <div className="flex rounded-lg border border-gray-700 bg-gray-950/60 p-0.5">
              {viewBtn("raw", "Raw transcript")}
              {viewBtn("segments", "Timestamp view")}
            </div>
          )}
        </div>
        {segments.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            Speaker labels aren&apos;t available yet — timestamps show where each point was said
            (speaker attribution arrives in a future update).
          </p>
        )}
        <div className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-gray-800 bg-gray-950/60 p-4">
          {transcriptView === "segments" && segments.length ? (
            segments.map((seg) => (
              <div
                key={seg.start_sec}
                ref={(el) => {
                  if (el) segRefs.current.set(seg.start_sec, el);
                  else segRefs.current.delete(seg.start_sec);
                }}
                className={`mb-2 rounded-lg px-2 py-1 text-sm leading-relaxed transition ${
                  highlightStart === seg.start_sec
                    ? "bg-indigo-500/20 ring-1 ring-indigo-500/50"
                    : "text-gray-300"
                }`}
              >
                <span className="mr-2 inline-block rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                  {formatTimestamp(seg.start_sec)}–{formatTimestamp(seg.end_sec)}
                </span>
                {seg.speaker ? (
                  <span className="mr-2 inline-block rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                    {seg.speaker}
                  </span>
                ) : null}
                {seg.text}
              </div>
            ))
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-400">
              {meeting.sourceText}
            </pre>
          )}
        </div>
      </section>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h3 className="font-semibold text-indigo-300">Executive summary</h3>
        <p className="mt-2 leading-relaxed text-gray-300">
          {ex.executive_summary || "No summary was extracted."}
        </p>
      </div>

      <section>
        <h3 className="text-lg font-semibold">Decisions</h3>
        {ex.decisions.length ? (
          <ul className="mt-3 space-y-2">
            {ex.decisions.map((d, i) => (
              <DecisionCard
                key={`${d.decision}-${i}`}
                d={d}
                segment={matchingSegment(segments, d.decision)}
                onJump={jumpTo}
              />
            ))}
          </ul>
        ) : (
          <EmptyNote text="No decisions were extracted." />
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold">Action items</h3>
        {ex.action_items.length ? (
          <ul className="mt-3 space-y-2">
            {ex.action_items.map((a, i) => (
              <ActionItemCard
                key={`${a.task}-${i}`}
                item={a}
                segment={matchingSegment(segments, a.task)}
                onJump={jumpTo}
              />
            ))}
          </ul>
        ) : (
          <EmptyNote text="No action items were extracted." />
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold">Questions</h3>
        {ex.questions.length ? (
          <ul className="mt-3 space-y-2">
            {ex.questions.map((q, i) => (
              <QuestionCard key={`${q.question}-${i}`} q={q} />
            ))}
          </ul>
        ) : (
          <EmptyNote text="No questions were extracted." />
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold">Risks</h3>
        {ex.risks.length ? (
          <ul className="mt-3 space-y-2">
            {ex.risks.map((r, i) => (
              <RiskCard
                key={`${r.description}-${i}`}
                r={r}
                segment={matchingSegment(segments, r.description)}
                onJump={jumpTo}
              />
            ))}
          </ul>
        ) : (
          <EmptyNote text="No risks were extracted." />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sign-in gate                                                        */
/* ------------------------------------------------------------------ */
function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 text-indigo-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2Z"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to analyze a transcript</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        Your meetings are private to your DocSnap account. After signing in
        you can upload a transcript or paste one, get the AI extraction, and
        keep every meeting saved and searchable.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in
        </button>
      </SignInButton>
      <p className="mt-4 text-xs text-gray-600">
        Meetings can't be saved without signing in.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analyzer + saved meetings                                           */
/* ------------------------------------------------------------------ */
export function MeetingsnapApp() {
  const { user } = useUser();
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<MeetingDetail | null>(null);
  const [configured, setConfigured] = useState(true);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Audio recording → speech-to-text
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Ask AI
  const [askQuestion, setAskQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askNotEnabled, setAskNotEnabled] = useState(false);
  const [askResult, setAskResult] = useState<AskAIResult | null>(null);
  const [askError, setAskError] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<MeetingSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState("");

  const loadMeetings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await listMeetings();
      setConfigured(res.configured);
      setMeetings(res.meetings as MeetingSummary[]);
    } catch {
      setConfigured(true);
      setMeetings([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadMeetings();
  }, [user, loadMeetings]);

  async function handleFile(file: File) {
    setFile(file);
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
    try {
      setSourceText(await extractFileText(file));
    } catch (e) {
      setError(messageFromError(e, "That file could not be read."));
    }
  }

  async function selectAudioFile(file: File) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["mp3", "wav", "m4a", "mp4", "webm"].includes(ext)) {
      setError("That file type isn't supported for audio. Please use MP3, WAV, M4A, MP4, or WebM.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That recording is larger than the 25MB limit for transcription. Trim it or split it and try again.");
      return;
    }
    setError("");
    setAudioFile(file);
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
  }

  async function runAudioAnalyze() {
    if (!audioFile) return;
    setError("");
    setNotice("");
    setResult(null);
    setAudioBusy(true);
    try {
      const uploaded = await uploadAudioRecording(audioFile);
      if (!uploaded) {
        setError(
          "Recording upload isn't connected yet — the team hasn't configured UploadThing here. You can paste a transcript below in the meantime.",
        );
        return;
      }
      const res = await analyzeAudio({
        data: { title, fileUrl: uploaded.fileUrl, fileName: audioFile.name },
      });
      setConfigured(res.configured);
      setResult(res.meeting as MeetingDetail);
      setNotice(
        res.configured
          ? "Recording transcribed and saved — it now appears under Your meetings below."
          : "Recording transcribed, but storage isn't connected here, so this meeting is shown for this session only.",
      );
    } catch (e) {
      setError(messageFromError(e, "Couldn't transcribe that recording. Please try again."));
    } finally {
      setAudioBusy(false);
    }
  }

  async function runAnalyze() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await analyzeMeeting({ data: { title, sourceText } });
      setConfigured(res.configured);
      setResult(res.meeting as MeetingDetail);
      setNotice(
        res.configured
          ? "Meeting saved — it now appears under Your meetings below."
          : "Storage isn't connected here, so this meeting is shown for this session only.",
      );
    } catch (e) {
      setError(messageFromError(e, "Analysis failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function openMeeting(id: number) {
    setError("");
    try {
      const res = await getMeeting({ data: { id } });
      if (res.meeting) {
        setResult(res.meeting as MeetingDetail);
        setTitle(res.meeting.title);
      } else {
        setError("That meeting could not be opened.");
      }
    } catch (e) {
      setError(messageFromError(e, "That meeting could not be opened."));
    }
  }

  async function runAsk() {
    setAskError("");
    setAskResult(null);
    setAskNotEnabled(false);
    setAskBusy(true);
    try {
      const res = await askAI({ data: { question: askQuestion } });
      if (!res.configured) {
        setAskNotEnabled(true);
      } else if (res.result) {
        setAskResult(res.result);
      }
    } catch (e) {
      setAskError(messageFromError(e, "Couldn't answer that. Please try again."));
    } finally {
      setAskBusy(false);
    }
  }

  async function runSearch() {
    setSearchError("");
    setSearchBusy(true);
    try {
      const res = await searchMeetings({ data: { query: searchQuery } });
      setSearchResults(res.meetings as MeetingSearchResult[]);
    } catch (e) {
      setSearchError(messageFromError(e, "Search failed. Please try again."));
      setSearchResults(null);
    } finally {
      setSearchBusy(false);
    }
  }

  if (!user) {
    return <SignInRequired />;
  }

  const canAnalyze =
    sourceText.trim().length >= 20 && !busy;

  return (
    <div className="mt-8 space-y-10">
      {notice && (
        <p role="status" className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-200">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {!configured && (
        <p role="status" className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-sm text-gray-400">
          Storage isn't connected yet — meetings can't be saved right now, but you can still analyze in this session.
        </p>
      )}

      {/* Input: upload or paste */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Upload or paste a transcript</h2>
        <p className="mt-1 text-sm text-gray-500">
          Paste a meeting transcript, or upload a TXT export (Zoom, Teams, or
          Meet exports work too). AI extracts the decisions, action items,
          owners, due dates, questions, and risks — each with a confidence score.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-5 text-center transition hover:border-indigo-500/60"
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".txt,.text,.md,.vtt,.srt,.log,.pdf,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800 text-xl text-gray-300">
            ↑
          </div>
          <p className="mt-3 text-sm font-medium text-gray-200">
            Drop a transcript here
          </p>
          <p className="mt-1 text-xs text-gray-500">
            or click to browse · TXT fully supported · PDF/DOCX best-effort
          </p>
          {file && (
            <p className="mt-2 text-xs text-indigo-300">{file.name} loaded</p>
          )}
        </div>
        <label htmlFor="title" className="mt-4 block text-sm font-medium text-gray-300">
          Meeting title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q3 planning — Aug 21"
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 px-3 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <label htmlFor="source" className="mt-4 block text-sm font-medium text-gray-300">
          Transcript text
        </label>
        <textarea
          id="source"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={10}
          placeholder={"Speaker 1: Let's kick off. \nSpeaker 2: I think we should ship the new onboarding by the end of the month…"}
          className="mt-1 w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-gray-300 placeholder:text-gray-600 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={runAnalyze}
          className="mt-4 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Analyzing your meeting…" : "Analyze meeting"}
        </button>
        <p className="mt-2 text-center text-xs text-gray-600">
          Your transcript is sent securely for extraction and saved with your meeting.
        </p>
      </section>

      {/* Input: upload a recording (speech-to-text) */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Or upload a meeting recording</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload an MP3, WAV, M4A, MP4, or WebM recording (up to 25MB). We
          transcribe it with speech-to-text, then run the same AI extraction for
          decisions, action items, owners, due dates, questions, and risks.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void selectAudioFile(f);
          }}
          onClick={() => audioInputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-5 text-center transition hover:border-indigo-500/60"
        >
          <input
            ref={audioInputRef}
            className="hidden"
            type="file"
            accept=".mp3,.wav,.m4a,.mp4,.webm,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void selectAudioFile(f);
            }}
          />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800 text-xl text-gray-300">
            🎙
          </div>
          <p className="mt-3 text-sm font-medium text-gray-200">Drop a recording here</p>
          <p className="mt-1 text-xs text-gray-500">
            or click to browse · MP3 / WAV / M4A / MP4 / WebM · up to 25MB
          </p>
          {audioFile && (
            <p className="mt-2 text-xs text-indigo-300">{audioFile.name} selected</p>
          )}
        </div>
        <button
          type="button"
          disabled={!audioFile || audioBusy}
          onClick={() => void runAudioAnalyze()}
          className="mt-4 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {audioBusy ? "Transcribing & analyzing…" : "Transcribe & analyze recording"}
        </button>
        <p className="mt-2 text-center text-xs text-gray-600">
          Your recording is transcribed securely and treated like a transcript — saved with your meeting.
        </p>
      </section>

      {/* Results */}
      {result ? <ResultsView meeting={result} /> : null}

      {/* Ask AI */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Ask AI about your meetings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ask a natural-language question, e.g. “What did Bob agree to?” The
          answer is grounded only in your saved meetings — if it isn't in them,
          it will say so.
        </p>
        {askError && (
          <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {askError}
          </p>
        )}
        {askNotEnabled && (
          <p role="status" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Ask AI isn't enabled yet — the AI backend (OPENAI_API_KEY) isn't
            connected here. Answers are grounded only in your own meetings and
            are never sent elsewhere.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && askQuestion.trim().length >= 3 && !askBusy) void runAsk();
            }}
            placeholder="e.g. What did Bob agree to?"
            className="w-full flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            disabled={askBusy || askQuestion.trim().length < 3}
            onClick={() => void runAsk()}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {askBusy ? "Asking…" : "Ask"}
          </button>
        </div>
        {askResult && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-sm leading-relaxed text-gray-200">{askResult.answer}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {askResult.grounded ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Grounded in your meetings
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Not found in your meetings
                </span>
              )}
              {askResult.references.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void openMeeting(r.id)}
                  className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-0.5 text-[10px] font-medium text-indigo-300 transition hover:border-indigo-500"
                >
                  {r.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Saved meetings + search */}
      <section>
        <h2 className="text-xl font-semibold">Your meetings</h2>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim() && !searchBusy) void runSearch();
            }}
            placeholder="Search your meetings (title, summary, decisions, action items)…"
            className="w-full flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            disabled={searchBusy || !searchQuery.trim()}
            onClick={() => void runSearch()}
            className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-medium text-gray-200 transition hover:border hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {searchBusy ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError && (
          <p role="alert" className="mt-3 text-sm text-red-300">{searchError}</p>
        )}
        {searchResults !== null && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500">
              {searchResults.length
                ? `${searchResults.length} match${searchResults.length === 1 ? "" : "es"} for “${searchQuery}”`
                : `No meetings match “${searchQuery}”.`}
            </p>
            {searchResults.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openMeeting(m.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-left transition hover:border-indigo-500/50"
              >
                <span>
                  <span className="font-medium text-gray-200">{m.title}</span>
                  <span className="mt-0.5 block text-[10px] text-gray-500">
                    Matched on {m.matchedOn === "title" ? "title" : "summary / decisions / action items"}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 space-y-2">
          {meetings.length ? (
            meetings.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openMeeting(m.id)}
                className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-left transition hover:border-indigo-500/50"
              >
                <span className="font-medium text-gray-200">{m.title}</span>
                <span className="text-xs text-gray-500">
                  {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ""}
                </span>
              </button>
            ))
          ) : (
            <EmptyNote text="Your saved meetings will appear here after you analyze one." />
          )}
        </div>
      </section>
    </div>
  );
}
