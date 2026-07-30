interface ProcessingScreenProps {
  capturedImage: string | null;
  importProgress: { current: number; total: number } | null;
}

export function ProcessingScreen({ capturedImage, importProgress }: ProcessingScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 animate-fade-in">
      {!importProgress && capturedImage && (
        <div className="w-full max-w-sm overflow-hidden rounded-lg bg-black/50">
          <img
            src={capturedImage}
            alt="Captured document"
            className="w-full object-contain opacity-50"
          />
        </div>
      )}
      {importProgress && (
        <div className="w-full max-w-sm space-y-3">
          <div className="overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
              style={{
                width: `${(importProgress.current / importProgress.total) * 100}%`,
              }}
            />
          </div>
          <p className="text-center text-sm text-gray-400">
            Processing {importProgress.current} of {importProgress.total}…
          </p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="text-gray-300">Processing…</p>
      </div>
      <p className="text-sm text-gray-500">
        {importProgress
          ? "Detecting document edges in selected images"
          : "Detecting document edges"}
      </p>
    </div>
  );
}
