import type { NamingKind } from "../documentNamer";
import type { DetectedExpiration } from "../expirationDetector";
import { formatExpirationDate } from "../expirationDetector";
import type { NotifyBefore } from "../reminders";

interface NameReviewScreenProps {
  /** Current value of the document name input (no .pdf extension) */
  documentName: string;
  onDocumentNameChange: (name: string) => void;
  /** The AI-suggested name (no .pdf extension) */
  suggestion: string;
  /** Which naming strategy produced the suggestion */
  suggestionKind: NamingKind;
  /** Total pages in the PDF being downloaded */
  pageCount: number;
  onDownload: () => void;
  expiration?: DetectedExpiration;
  isPro?: boolean;
  onReminderChange?: (days: NotifyBefore | null) => void;
  reminderDays?: NotifyBefore | null;
  upgradeUrl?: string;
}

const KIND_LABELS: Record<NamingKind, string> = {
  tax: "Tax document",
  bill: "Bill or invoice",
  receipt: "Receipt",
  insurance: "Insurance document",
  medical: "Medical document",
  category: "Detected from document type",
  generic: "Document",
};

export function NameReviewScreen({
  documentName,
  onDocumentNameChange,
  suggestion,
  suggestionKind,
  pageCount,
  onDownload,
  expiration,
  isPro = false,
  onReminderChange,
  reminderDays,
  upgradeUrl = "/pricing",
}: NameReviewScreenProps) {
  const isSuggested = documentName.trim() === suggestion.trim();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 animate-fade-in">
      <div className="w-full max-w-md space-y-3 text-center">
        {/* Sparkle icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-indigo-600/25">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold tracking-tight">
          Suggested name ready
        </h2>
        <p className="text-sm text-gray-400">
          We read the text in your scan and suggested a filename. Keep it or
          edit it to whatever you like — the name is yours.
        </p>
      </div>

      <div className="w-full max-w-md space-y-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        {/* Detected type chip */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-900/50 px-3 py-1 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
            Detected: {KIND_LABELS[suggestionKind]}
          </span>
        </div>

        <div>
          <label
            htmlFor="suggested-document-name"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-gray-300"
          >
            <span>Name your document</span>
            {isSuggested && (
              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-900/40 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-300 ring-1 ring-fuchsia-500/40">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                  />
                </svg>
                Suggested
              </span>
            )}
          </label>
          <input
            id="suggested-document-name"
            type="text"
            value={documentName}
            onChange={(e) => onDocumentNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDownload();
            }}
            placeholder="Document - Aug 6 2026"
            aria-label="Document filename"
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3.5 py-3 text-base text-white shadow-inner outline-none transition placeholder:text-gray-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            .pdf is added automatically when you download
          </p>
        </div>

        {expiration && (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-left">
            <p className="font-semibold text-amber-200">📅 Expiration detected: {formatExpirationDate(expiration.date)}</p>
            {isPro ? <div className="mt-3 flex items-center gap-2"><span className="text-sm text-gray-300">🔔 Remind me</span><select aria-label="Reminder timing" value={reminderDays == null ? "skip" : String(reminderDays)} onChange={(e) => onReminderChange?.(e.target.value === "skip" ? null : Number(e.target.value) as NotifyBefore)} className="rounded-lg border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"><option value="skip">Skip</option><option value="30">30 days before</option><option value="14">14 days before</option><option value="7">7 days before</option><option value="0">On the date</option></select></div> : <p className="mt-2 text-xs text-gray-400">Date tracking is a Pro feature — <a className="text-indigo-300 underline" href={upgradeUrl}>upgrade to set reminders</a></p>}
          </div>
        )}

        <button
          onClick={onDownload}
          className="w-full rounded-full bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-[0.98]"
        >
          Download PDF ({pageCount} {pageCount === 1 ? "page" : "pages"})
        </button>
      </div>
    </div>
  );
}
