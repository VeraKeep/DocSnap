interface CloudSyncPanelProps {
  isSignedIn: boolean;
  isCloudReady: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  pageCount: number;
  isGenerating: boolean;
  /** Number of documents currently in cloud storage */
  cloudDocCount: number;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  onSaveToCloud: () => void;
}

/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

/**
 * CloudSyncPanel — the save-to-cloud button shown in the preview state.
 * This is a standalone version for use when the save button needs to be rendered
 * separately from the main PDFActions bar.
 */
export function CloudSyncPanel({
  isSignedIn,
  isCloudReady,
  isSaving,
  saveSuccess,
  pageCount,
  isGenerating,
  cloudDocCount,
  docLimit,
  upgradeUrl,
  onSaveToCloud,
}: CloudSyncPanelProps) {
  if (!isSignedIn || !isCloudReady) return null;

  const atDocLimit = cloudDocCount >= docLimit;

  if (atDocLimit) {
    return (
      <a
        href={upgradeUrl}
        className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-900/20 px-5 py-3 text-sm font-semibold text-amber-400 transition hover:bg-amber-900/40 hover:text-amber-300 active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
        </svg>
        Upgrade to Pro for unlimited storage
      </a>
    );
  }

  return (
    <button
      onClick={() => { vibrate(12); onSaveToCloud(); }}
      disabled={isGenerating || isSaving}
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
  );
}
