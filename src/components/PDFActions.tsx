interface PDFActionsProps {
  pageCount: number;
  isGenerating: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  isSignedIn: boolean;
  cloudConfigured: boolean;
  /** True when the user has connected a SecureVault vault (opt-in). */
  secureVaultConfigured: boolean;
  /** Number of documents currently in cloud storage */
  cloudDocCount: number;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  isPro: boolean;
  password: string;
  passwordEnabled: boolean;
  onPasswordEnabledChange: (enabled: boolean) => void;
  onPasswordChange: (password: string) => void;
  onRetake: () => void;
  onAddFromCamera: () => void;
  onAddFromPhotos: () => void;
  documentName: string;
  onDocumentNameChange: (name: string) => void;
  onSaveToCloud: () => void;
  onSaveToVault: () => void;
  /** Open the connect-vault modal. */
  onConnectVault: () => void;
  /** True while a Save to Vault is in flight. */
  isVaultSaving: boolean;
  /** Short status after a vault save (e.g. a SecureVault document id prefix). */
  vaultSaveState: "idle" | "success" | "error";
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
  secureVaultConfigured,
  cloudDocCount,
  docLimit,
  upgradeUrl,
  isPro,
  password,
  passwordEnabled,
  onPasswordEnabledChange,
  onPasswordChange,
  onRetake,
  onAddFromCamera,
  onAddFromPhotos,
  documentName,
  onDocumentNameChange,
  onSaveToCloud,
  onSaveToVault,
  onConnectVault,
  isVaultSaving,
  vaultSaveState,
  onDone,
}: PDFActionsProps) {
  const disabled = isGenerating || isSaving;
  const totalPages = pageCount + 1; // saved pages + current capture
  const atDocLimit = cloudDocCount >= docLimit;
  const isCustomName = documentName.trim().length > 0 && !/^Scan - [A-Za-z]+ \d{1,2}, \d{4}$/.test(documentName.trim());

  return (
    <div className="bg-gray-950 px-4 py-5 safe-bottom">
      <div className="mx-auto mb-4 w-full max-w-md text-left">
        <label htmlFor="document-name" className="mb-1.5 block text-sm font-medium text-gray-300">Name your document</label>
        <input id="document-name" type="text" value={documentName} onChange={(e) => onDocumentNameChange(e.target.value)} placeholder="2026 Taxes.pdf or Car Insurance.pdf" disabled={disabled} aria-label="Document filename" className={`w-full rounded-lg border bg-gray-800 px-3.5 py-3 text-base text-white shadow-inner outline-none transition placeholder:text-gray-500 disabled:opacity-50 ${isCustomName ? "border-emerald-500/70" : "border-gray-600"} focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40`} />
      </div>
      <div className="mx-auto mb-4 w-full max-w-md rounded-lg border border-gray-700 bg-gray-900/70 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={passwordEnabled} onChange={(e) => onPasswordEnabledChange(e.target.checked)} disabled={!isPro || disabled} className="h-4 w-4 accent-indigo-500" />
          <span>Password protect <span className="text-xs text-indigo-400">Pro</span></span>
        </label>
        {!isPro ? (
          <p className="mt-2 text-xs text-amber-400">Password-protected PDFs are a Pro feature. <a className="underline hover:text-amber-300" href={upgradeUrl}>Upgrade to Pro</a></p>
        ) : passwordEnabled ? (
          <div className="mt-2 flex gap-2">
            <input type="password" minLength={4} value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Enter a PDF password" disabled={disabled} className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400" aria-label="PDF password" />
            <button type="button" onClick={() => { const input = document.querySelector<HTMLInputElement>('input[aria-label="PDF password"]'); if (input) input.type = input.type === "password" ? "text" : "password"; }} className="rounded-md border border-gray-600 px-2 text-xs text-gray-300 hover:text-white">Show</button>
          </div>
        ) : null}
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
      {isSignedIn && (
        secureVaultConfigured ? (
          <button
            onClick={() => { vibrate(12); onSaveToVault(); }}
            disabled={disabled || isVaultSaving}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
              vaultSaveState === "success"
                ? "bg-teal-700 text-white"
                : vaultSaveState === "error"
                  ? "bg-rose-700 text-white"
                  : "border border-teal-500 bg-teal-600/20 text-teal-300 hover:bg-teal-600 hover:text-white"
            }`}
          >
            {isVaultSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving to vault…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                {vaultSaveState === "success" ? "Saved to vault!" : "Save to Vault"}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => { vibrate(10); onConnectVault(); }}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full border border-teal-500/50 px-5 py-3 text-sm font-medium text-teal-400 transition hover:border-teal-400 hover:text-teal-300 active:scale-95 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Connect vault
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
