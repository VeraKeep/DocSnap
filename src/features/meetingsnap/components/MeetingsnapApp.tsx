import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  analyzeMeeting,
  askAI,
  draftFollowUpEmail,
  getMeeting,
  listMeetings,
  searchMeetings,
} from "../server";
import {
  actionListToMarkdown,
  downloadText,
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
  type MeetingSummary,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Text extraction from an uploaded file (best-effort, client-side)    */
/* ------------------------------------------------------------------ */
const TEXT_EXTENSIONS = ["txt", "text", "md", "vtt", "srt", "log"];

async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  if (TEXT_EXTENSIONS.includes(ext)) {
    return await file.text();
  }
  // PDF / DOCX (and anything else): attempt a plain-text decode so that a
  // genuinely text-based export still works, but fail honestly when the bytes
  // are binary (which a naive UTF-8 decode of a real PDF/DOCX will be).
  const buf = await file.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buf);
  const printable = (text.match(/[\x20-\x7E\n\r\t]/g) ?? []).length;
  const ratio = text.length ? printable / text.length : 0;
  if (text.trim().length < 20 || ratio < 0.7) {
    throw new Error(
      `${file.name} looks like a binary ${ext.toUpperCase()} file. This MVP parses TXT exports and pasted text — export your transcript as .txt or paste it below.`,
    );
  }
  return text;
}

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

function Row({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-gray-200">{title}</span>
      {badge}
      <div className="w-full text-sm leading-relaxed text-gray-400">{children}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">
      {text}
    </p>
  );
}

function ActionItemCard({ item }: { item: MeetingActionItem }) {
  const low = isLowConfidence(item.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{item.task}</span>
        {low ? <ReviewBadge /> : <ConfidenceTag confidence={item.confidence} />}
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

function DecisionCard({ d }: { d: MeetingDecision }) {
  const low = isLowConfidence(d.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{d.decision}</span>
        {low ? <ReviewBadge /> : <ConfidenceTag confidence={d.confidence} />}
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

function RiskCard({ r }: { r: MeetingRisk }) {
  const low = isLowConfidence(r.confidence);
  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-gray-100">{r.description}</span>
        {low ? <ReviewBadge /> : <ConfidenceTag confidence={r.confidence} />}
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
  return (
    <div className="mt-8 space-y-8">
      <ExportToolbar meeting={meeting} />
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
              <DecisionCard key={`${d.decision}-${i}`} d={d} />
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
              <ActionItemCard key={`${a.task}-${i}`} item={a} />
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
              <RiskCard key={`${r.description}-${i}`} r={r} />
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
      setSourceText(await readFileText(file));
    } catch (e) {
      setError(messageFromError(e, "That file could not be read."));
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
