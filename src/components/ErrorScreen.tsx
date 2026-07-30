/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

/** Detects if the error is a camera permission denial. */
function isPermissionError(msg: string): boolean {
  return msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("notallowederror");
}

interface ErrorScreenProps {
  errorMessage: string;
  onTryAgain: () => void;
}

export function ErrorScreen({ errorMessage, onTryAgain }: ErrorScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center animate-fade-in">
      {isPermissionError(errorMessage) ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-900/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Camera access needed</h2>
          <p className="max-w-sm text-gray-400">
            DocSnap needs camera access to scan documents. Your camera is used
            entirely in your browser — images never leave your device.
          </p>

          <div className="mt-2 w-full max-w-sm space-y-4 text-left">
            <details className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-300">
                How to enable on iPhone / iPad
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-400">
                <li>Open the <strong className="text-gray-300">Settings</strong> app</li>
                <li>Scroll down and tap <strong className="text-gray-300">Safari</strong> (or your browser)</li>
                <li>Tap <strong className="text-gray-300">Camera</strong></li>
                <li>Select <strong className="text-gray-300">Allow</strong></li>
                <li>Return to this page and refresh</li>
              </ol>
            </details>

            <details className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-300">
                How to enable on Android
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-400">
                <li>Open <strong className="text-gray-300">Settings</strong> → <strong className="text-gray-300">Apps</strong></li>
                <li>Find your browser (Chrome, Firefox, etc.)</li>
                <li>Tap <strong className="text-gray-300">Permissions</strong></li>
                <li>Tap <strong className="text-gray-300">Camera</strong> and select <strong className="text-gray-300">Allow</strong></li>
                <li>Return to this page and refresh</li>
              </ol>
            </details>
          </div>

          <button
            onClick={() => { vibrate(12); onTryAgain(); }}
            className="mt-4 rounded-full bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95"
          >
            Try Again
          </button>
        </>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p className="max-w-sm text-gray-300">{errorMessage}</p>
          <button
            onClick={() => { vibrate(12); onTryAgain(); }}
            className="rounded-full bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95"
          >
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
