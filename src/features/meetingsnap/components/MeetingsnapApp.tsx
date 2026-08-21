import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import { analyzeMeeting, getMeeting, listMeetings } from "../server";
import {
  isLowConfidence,
  type MeetingActionItem,
  type MeetingDecision,
  type MeetingDetail,
  type MeetingExtraction,
  type MeetingQuestion,
  type MeetingRisk,
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

function ResultsView({ meeting }: { meeting: MeetingDetail }) {
  const ex: MeetingExtraction = meeting.extraction;
  return (
    <div className="mt-8 space-y-8">
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

      {/* Saved meetings */}
      <section>
        <h2 className="text-xl font-semibold">Your meetings</h2>
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
