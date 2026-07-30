interface OCRProgressProps {
  isGenerating: boolean;
  ocrProgress: { page: number; totalPages: number; status: string } | null;
  onSkip: () => void;
}

export function OCRProgress({ isGenerating, ocrProgress, onSkip }: OCRProgressProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center animate-fade-in">
      <div className="space-y-3">
        <div className="mx-auto flex items-center justify-center">
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
                d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.657 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802"
              />
            </svg>
            EN
          </span>
        </div>

        {!isGenerating && ocrProgress ? (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
              />
            </svg>
          </div>
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
          </div>
        )}

        <h2 className="text-2xl font-bold tracking-tight">
          {isGenerating
            ? "Generating PDF…"
            : ocrProgress
              ? "Recognizing text…"
              : "Preparing…"}
        </h2>

        {ocrProgress && (
          <div className="w-full max-w-xs space-y-2">
            <div className="overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-2 rounded-full bg-indigo-500 transition-all duration-500"
                style={{
                  width: `${Math.round((ocrProgress.page / ocrProgress.totalPages) * 100)}%`,
                }}
              />
            </div>
            <p className="text-sm text-gray-400">
              Page {ocrProgress.page} of {ocrProgress.totalPages}
              {ocrProgress.status === "failed" && (
                <span className="ml-1 text-amber-400">(text detection skipped)</span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={onSkip}
          disabled={isGenerating}
          className="rounded-full border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:bg-gray-700 active:scale-95 disabled:opacity-40"
        >
          Skip OCR
        </button>
        {!isGenerating && (
          <p className="text-xs text-gray-500">
            OCR makes your PDF searchable — it runs entirely in your browser
          </p>
        )}
      </div>
    </div>
  );
}
