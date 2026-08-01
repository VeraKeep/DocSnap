interface PDFActionsProps {
  pageCount: number;
  isGenerating: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  isSignedIn: boolean;
  cloudConfigured: boolean;
  /** Number of documents currently in cloud storage */
  cloudDocCount: number;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  onRetake: () => void;
  onAddFromCamera: () => void;
  onAddFromPhotos: () => void;
  documentName: string;
  onDocumentNameChange: (name: string) => void;
  onSaveToCloud: () => void;
  onDone: () => void;
}

/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

export function PDFActions({
  pageCount,
  isGenerating,
  isSaving,
  saveSuccess,
  isSignedIn,
  cloudConfigured,
  cloudDocCount,
  docLimit,
  upgradeUrl,
  onRetake,
  onAddFromCamera,
  onAddFromPhotos,
  documentName,
  onDocumentNameChange,
  onSaveToCloud,
  onDone,
}: PDFActionsProps) {
  const disabled = isGenerating || isSaving;
  const totalPages = pageCount + 1; // saved pages + current capture
  const atDocLimit = cloudDocCount >= docLimit;

  return (
    <div className="bg-gray-950 px-4 py-5 safe-bottom">
      <div className="mx-auto mb-4 w-full max-w-md text-left">
        <label htmlFor="document-name" className="mb-1.5 block text-sm font-medium text-gray-300">Name your document</label>
        <input id="document-name" type="text" value={documentName} onChange={(e) => onDocumentNameChange(e.target.value)} placeholder="2026 Taxes.pdf or Car Insurance.pdf" disabled={disabled} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        onClick={() => { vibrate(10); onRetake(); }}
        disabled={disabled}
        className="rounded-full border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white active:scale-95 disabled:opacity-40"
      >
        Retake
      </button>
      <button
        onClick={() => { vibrate(10); onAddFromCamera(); }}
        disabled={disabled}
        className="rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-300 active:scale-95 disabled:opacity-40"
      >
        <span className="hidden sm:inline">Add from </span>Camera
      </button>
      <button
        onClick={() => { vibrate(10); onAddFromPhotos(); }}
        disabled={disabled}
        className="rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-300 active:scale-95 disabled:opacity-40"
      >
        <span className="hidden sm:inline">Add from </span>Photos
      </button>
      {isSignedIn && cloudConfigured && (
        atDocLimit ? (
          <a
            href={upgradeUrl}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-900/20 px-5 py-3 text-sm font-semibold text-amber-400 transition hover:bg-amber-900/40 hover:text-amber-300 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
            Upgrade to Pro for unlimited storage
          </a>
        ) : (
          <button
            onClick={() => { vibrate(12); onSaveToCloud(); }}
            disabled={disabled}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
              saveSuccess
                ? "bg-green-700 text-white"
                : "border border-indigo-500 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white"
            }`}
          >
            {isSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving…
              </>
            ) : saveSuccess ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Saved!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                </svg>
                Save to Cloud
              </>
            )}
          </button>
        )
      )}
      <button
        onClick={() => { vibrate(12); onDone(); }}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95 disabled:opacity-40"
      >
        {isGenerating ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Generating…
          </>
        ) : (
          `Done (${totalPages} ${totalPages === 1 ? "page" : "pages"})`
        )}
      </button>
      </div>
    </div>
  );
}
