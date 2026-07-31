import type { OCRProgressInfo } from "../hooks/useOCR";

interface OCRProgressProps {
  isGenerating: boolean;
  ocrProgress: OCRProgressInfo | null;
  onSkip: () => void;
}

function formatETA(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "Calculating…";
  if (seconds <= 0) return "Almost done";
  if (seconds < 60) return `~${seconds}s remaining`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min remaining`;
}

function getPhaseLabel(progress: OCRProgressInfo | null, isGenerating: boolean): string {
  if (isGenerating) return "Generating PDF…";
  if (!progress) return "Preparing…";

  switch (progress.phase) {
    case "preparing":
      return "Preparing document…";
    case "rendering":
      return `Rendering page ${progress.page} of ${progress.totalPages}…`;
    case "recognizing":
      return `Recognizing text on page ${progress.page} of ${progress.totalPages}…`;
    case "assembling":
      return "Assembling PDF…";
    default:
      return "Processing…";
  }
}

function getPhaseDescription(progress: OCRProgressInfo | null, isGenerating: boolean): string {
  if (isGenerating) return "Combining pages into a downloadable PDF file";
  if (!progress) return "Setting up text recognition engine";

  switch (progress.phase) {
    case "preparing":
      return "Loading the text recognition engine in your browser";
    case "rendering":
      return "Applying your selected filters to each page";
    case "recognizing":
      if (progress.status === "recognizing") {
        return "Reading text from the scanned image — this runs entirely on your device";
      }
      if (progress.status === "failed") {
        return "Text detection skipped for this page — it will still be included in the PDF";
      }
      return `Text layer captured for page ${progress.page}`;
    case "assembling":
      return "Creating your searchable PDF file";
    default:
      return "Processing your document — this stays on your device";
  }
}

export function OCRProgress({ isGenerating, ocrProgress, onSkip }: OCRProgressProps) {
  const phase = ocrProgress?.phase ?? null;
  const isAssembling = phase === "assembling";
  const isRecognizing = phase === "recognizing";
  const isRendering = phase === "rendering";

  // Determine overall progress for the bar
  let overallPercent = 0;
  if (ocrProgress && ocrProgress.totalPages > 0) {
    if (phase === "rendering") {
      overallPercent = Math.round((ocrProgress.pageProgress * 100) * 0.2); // First 20%
    } else if (phase === "recognizing") {
      const base = 20;
      const ocrFraction = (ocrProgress.page - 1 + ocrProgress.pageProgress) / ocrProgress.totalPages;
      overallPercent = Math.round(base + ocrFraction * 60); // 20-80%
    } else if (phase === "assembling") {
      overallPercent = 95; // Almost done
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center animate-fade-in">
      <div className="space-y-3 w-full max-w-xs">
        {/* Language badge */}
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

        {/* Icon area */}
        {isAssembling ? (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-green-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
          </div>
        ) : isGenerating ? (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
          </div>
        ) : (
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
        )}

        {/* Main heading */}
        <h2 className="text-2xl font-bold tracking-tight">
          {getPhaseLabel(ocrProgress, isGenerating)}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-400">
          {getPhaseDescription(ocrProgress, isGenerating)}
        </p>

        {/* Progress bar */}
        {(ocrProgress || isGenerating) && (
          <div className="w-full space-y-2">
            <div className="overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  isAssembling ? "bg-green-500" : "bg-indigo-500"
                }`}
                style={{ width: `${isAssembling ? 95 : overallPercent || 5}%` }}
              />
            </div>

            {/* Detailed stats */}
            {isRecognizing && ocrProgress && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Page {ocrProgress.page} of {ocrProgress.totalPages}
                </span>
                <span className="text-indigo-400">
                  {formatETA(ocrProgress.etaSeconds)}
                </span>
              </div>
            )}

            {isAssembling && (
              <p className="text-xs text-green-400 animate-pulse">
                Almost ready — preparing your download…
              </p>
            )}

            {isRendering && ocrProgress && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Page {ocrProgress.page} of {ocrProgress.totalPages}
                </span>
              </div>
            )}

            {/* OCR failure indicator */}
            {ocrProgress?.status === "failed" && (
              <p className="text-xs text-amber-400">
                Text detection skipped for page {ocrProgress.page} — image still included in PDF
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={onSkip}
          disabled={isGenerating || isAssembling}
          className="rounded-full border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:bg-gray-700 active:scale-95 disabled:opacity-40"
        >
          Skip OCR
        </button>
        {!isGenerating && !isAssembling && (
          <p className="text-xs text-gray-500">
            OCR makes your PDF searchable — it runs entirely in your browser
          </p>
        )}
      </div>
    </div>
  );
}
