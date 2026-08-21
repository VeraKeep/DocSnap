import { useState } from "react";
import {
  type ContractDetail,
  type ContractEvent,
  type SourceStatus,
  TIMELINE_STEP_LABELS,
  factText,
  isLowConfidence,
} from "../types";

/** "Confirmed from document" vs "AI interpretation" trust badge. */
function SourceBadge({ status, confidence }: { status: SourceStatus; confidence: number }) {
  const confirmed = status === "confirmed";
  const low = !confirmed && isLowConfidence(confidence);
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        confirmed
          ? "bg-emerald-500/15 text-emerald-300"
          : low
            ? "bg-amber-500/15 text-amber-300"
            : "bg-sky-500/15 text-sky-300",
      ].join(" ")}
      title={`confidence ${(confidence * 100).toFixed(0)}%`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${confirmed ? "bg-emerald-400" : low ? "bg-amber-400" : "bg-sky-400"}`}
        aria-hidden="true"
      />
      {confirmed ? "Confirmed from document" : low ? "AI interpretation · review" : "AI interpretation"}
    </span>
  );
}

function FactRow({
  label,
  value,
  status,
  confidence,
}: {
  label: string;
  value: string;
  status?: SourceStatus;
  confidence?: number;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-800/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-200">{value}</span>
        {status && <SourceBadge status={status} confidence={confidence ?? 0} />}
      </span>
    </div>
  );
}

/** The contract timeline — Signed → Effective → Cancellation → Renewal → Expiration. */
function ContractTimeline({ events }: { events: ContractEvent[] }) {
  const order = ["signed", "effective", "cancellation_deadline", "renewal", "expiration"];
  const byType = new Map<string, ContractEvent>();
  for (const e of events) byType.set(e.event_type, e);
  const steps = order.map((t) => ({ type: t, event: byType.get(t) }));

  return (
    <ol className="relative ml-3 space-y-6">
      {steps.map(({ type, event }) => {
        const label = TIMELINE_STEP_LABELS[type] ?? type;
        const active = !!event;
        return (
          <li key={type} className="relative pl-8">
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 ${
                active ? "border-indigo-400 bg-indigo-500/30" : "border-gray-700 bg-gray-900"
              }`}
            />
            <div>
              <p className={`text-sm font-medium ${active ? "text-gray-200" : "text-gray-500"}`}>
                {label}
              </p>
              <p className="text-xs text-gray-500">
                {active ? (event!.date ?? "—") : "Not stated in document"}
                {active && event!.source === "interpreted" ? (
                  <span className="ml-2 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
                    AI interpretation
                  </span>
                ) : active && event!.source === "confirmed" ? (
                  <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                    Confirmed from document
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{title}</h4>
      <div className="mt-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200">
      {children}
    </p>
  );
}

/** Full contract detail view: facts, summary, clauses, timeline, reminders. */
export function ContractDetailView({ contract }: { contract: ContractDetail }) {
  const [showRaw, setShowRaw] = useState(false);
  const ex = contract.extraction;
  const pending = contract.analysis_status === "pending";

  return (
    <div className="mt-6 space-y-6">
      {/* Informational / not legal advice notice */}
      <Notice>
        ⚖️ <strong>Informational, not legal advice.</strong> ContractSnap summarizes what
        its AI found in your document. It is not a lawyer and this summary is not legal
        advice. Trust only what is "Confirmed from document"; review "AI interpretation"
        findings before acting.
      </Notice>

      {pending ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <h3 className="font-semibold text-indigo-300">Analysis pending</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            This contract was saved, but the AI backend (OPENAI_API_KEY) isn't connected yet,
            so no structured extraction was generated. The raw text below is available for
            review. Connect the AI backend and re-upload to get the plain-language summary,
            clauses, and timeline.
          </p>
        </div>
      ) : !ex ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <p className="text-sm text-gray-400">No extraction available for this contract yet.</p>
        </div>
      ) : (
        <>
          {/* Header facts */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{ex.title}</h2>
                {ex.contract_type && (
                  <p className="mt-1 text-sm text-indigo-300">{ex.contract_type}</p>
                )}
              </div>
              {ex.auto_renewal && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    ex.auto_renewal.value === true
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {ex.auto_renewal.value === true ? "Auto-renews" : "No auto-renewal"}
                </span>
              )}
            </div>

            {ex.parties.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parties</p>
                <ul className="mt-2 space-y-2">
                  {ex.parties.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                      <span>{p.name ?? "—"}</span>
                      {p.role && <span className="text-gray-500">({p.role})</span>}
                      <SourceBadge status={p.source_status} confidence={p.confidence} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Key dates</p>
              <div className="mt-1">
                <FactRow label="Effective" value={factText(ex.effective_date)} />
                <FactRow label="Expiration" value={factText(ex.expiration_date)} />
                <FactRow label="Renewal" value={factText(ex.renewal_date)} />
                <FactRow label="Cancellation deadline" value={factText(ex.cancellation_deadline)} />
                <FactRow
                  label="Cancellation window"
                  value={
                    ex.cancellation_window_days?.value != null
                      ? `${factText(ex.cancellation_window_days)} days before`
                      : "—"
                  }
                />
                <FactRow
                  label="Notice period"
                  value={ex.notice_period_days?.value != null ? `${factText(ex.notice_period_days)} days` : "—"}
                />
                <FactRow
                  label="Renewal type"
                  value={ex.renewal_type ? String(ex.renewal_type) : "—"}
                />
              </div>
            </div>
          </section>

          {/* Plain-language summary */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
            <h3 className="font-semibold text-indigo-300">Plain-language summary</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryCard title="What this contract does">
                {ex.summary.what_this_contract_does || "—"}
              </SummaryCard>
              <SummaryCard title="What you pay">
                {ex.payment
                  ? [
                      ex.payment.amount != null
                        ? `${ex.payment.currency || "USD"} ${ex.payment.amount}${ex.payment.frequency ? ` / ${ex.payment.frequency}` : ""}`
                        : null,
                      ex.summary.what_you_pay || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  : ex.summary.what_you_pay || "—"}
              </SummaryCard>
              <SummaryCard title="What you must do">
                {ex.summary.what_you_must_do || "—"}
              </SummaryCard>
              <SummaryCard title="What they must do">
                {ex.summary.what_they_must_do || "—"}
              </SummaryCard>
              {ex.summary.important_dates.length > 0 && (
                <SummaryCard title="Important dates">
                  <ul className="list-disc space-y-1 pl-4">
                    {ex.summary.important_dates.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </SummaryCard>
              )}
              {ex.summary.watch_out_for.length > 0 && (
                <SummaryCard title="Watch out for">
                  <ul className="list-disc space-y-1 pl-4">
                    {ex.summary.watch_out_for.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </SummaryCard>
              )}
            </div>
          </section>

          {/* Contract timeline */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
            <h3 className="font-semibold text-indigo-300">Contract timeline</h3>
            <div className="mt-4">
              <ContractTimeline events={ex.events} />
            </div>
          </section>

          {/* Detected clauses */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
            <h3 className="font-semibold text-indigo-300">Detected clauses</h3>
            {ex.clauses.length ? (
              <ul className="mt-4 space-y-3">
                {ex.clauses.map((c, i) => (
                  <li key={i} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold capitalize text-gray-100">{c.type}</span>
                      <div className="flex items-center gap-2">
                        {c.location && (
                          <span className="text-[10px] text-gray-500">{c.location}</span>
                        )}
                        <SourceBadge status={c.source_status} confidence={c.confidence} />
                      </div>
                    </div>
                    {c.text && (
                      <p className="mt-2 text-sm leading-relaxed text-gray-400">{c.text}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-gray-500">No clauses were detected.</p>
            )}
          </section>

          {/* Reminders */}
          {ex.reminders.length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
              <h3 className="font-semibold text-indigo-300">Reminders</h3>
              <ul className="mt-4 space-y-2">
                {ex.reminders.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
                    <span className="text-sm capitalize text-gray-200">{r.type}</span>
                    <span className="text-sm text-gray-400">{r.due_date ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Fees / penalties / jurisdiction */}
          {(ex.fees || ex.deposits || ex.penalties || ex.jurisdiction || ex.major_obligations.length > 0) && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
              <h3 className="font-semibold text-indigo-300">Other important terms</h3>
              <div className="mt-3 space-y-2 text-sm">
                {ex.fees && <FactRow label="Fees" value={ex.fees} />}
                {ex.deposits && <FactRow label="Deposits" value={ex.deposits} />}
                {ex.penalties && <FactRow label="Penalties" value={ex.penalties} />}
                {ex.jurisdiction && <FactRow label="Jurisdiction" value={ex.jurisdiction} />}
              </div>
              {ex.major_obligations.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Major obligations
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-300">
                    {ex.major_obligations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Raw source text */}
      {contract.sourceText && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="text-sm font-medium text-gray-300 transition hover:text-indigo-300"
          >
            {showRaw ? "Hide" : "Show"} raw document text
          </button>
          {showRaw && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-400">
              {contract.sourceText}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
