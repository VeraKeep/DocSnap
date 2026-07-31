interface CameraViewProps {
  videoRefCallback: (video: HTMLVideoElement | null) => void;
  showCaptureFlash: boolean;
  savedPageCount: number;
  onCapture: () => void;
  isDesktop: boolean;
}

/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

export function CameraView({
  videoRefCallback,
  showCaptureFlash,
  savedPageCount,
  onCapture,
  isDesktop,
}: CameraViewProps) {
  return (
    <div className="relative flex flex-1 flex-col animate-fade-in">
      {/* Capture flash overlay */}
      {showCaptureFlash && (
        <div className="absolute inset-0 z-50 bg-white animate-flash pointer-events-none" />
      )}

      {/* Page count badge */}
      {savedPageCount > 0 && (
        <div className="absolute left-0 right-0 top-0 z-10 flex justify-center safe-pt pt-3">
          <span className="rounded-full bg-gray-900/80 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur-sm">
            {savedPageCount} {savedPageCount === 1 ? "page" : "pages"} saved
          </span>
        </div>
      )}

      {/* Keyboard shortcut hint (desktop only) */}
      {isDesktop && (
        <div className="absolute right-4 top-4 z-10">
          <span className="rounded-full bg-gray-900/70 px-2.5 py-1 text-[11px] text-gray-500 backdrop-blur-sm">
            Press <kbd className="font-mono text-gray-400">Space</kbd> to capture
          </span>
        </div>
      )}

      {/* Video preview */}
      <div className="relative flex-1 bg-black animate-scale-in">
        <video
          ref={videoRefCallback}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* Capture button bar */}
      <div className="flex items-center justify-center bg-gray-950 px-6 py-6 safe-bottom">
        <button
          onClick={() => { vibrate(10); onCapture(); }}
          className="group relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white shadow-lg transition active:scale-95"
          aria-label="Capture photo"
        >
          <div className="h-14 w-14 rounded-full bg-gray-200 transition group-hover:bg-gray-300" />
        </button>
      </div>
    </div>
  );
}
