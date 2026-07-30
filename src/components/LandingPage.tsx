import { Link } from "@tanstack/react-router";
import { SignInButton, SignUpButton, UserButton } from "@clerk/tanstack-start";
import { MyScans } from "./MyScans";
import type { CloudDocument } from "../cloudStorage";

interface LandingPageProps {
  authLoaded: boolean;
  isSignedIn: boolean;
  cloudConfigured: boolean;
  showMyScans: boolean;
  savedDocs: CloudDocument[];
  loadingDocs: boolean;
  deletingDocId: string | null;
  userEmail: string | undefined;
  userName: string | undefined;
  onOpenCamera: () => void;
  onChoosePhotos: () => void;
  onToggleMyScans: () => void;
  onCloseMyScans: () => void;
  onDownloadDoc: (doc: CloudDocument) => void;
  onDeleteDoc: (docId: string) => void;
}

export function LandingPage({
  authLoaded,
  isSignedIn,
  cloudConfigured,
  showMyScans,
  savedDocs,
  loadingDocs,
  deletingDocId,
  userEmail,
  userName,
  onOpenCamera,
  onChoosePhotos,
  onToggleMyScans,
  onCloseMyScans,
  onDownloadDoc,
  onDeleteDoc,
}: LandingPageProps) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Animated gradient hero */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-8 pt-16 text-center">
        {/* Gradient background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(79,70,229,0.25) 0%, rgba(3,7,18,0) 70%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: "radial-gradient(ellipse 40% 40% at 80% 80%, rgba(99,102,241,0.2) 0%, rgba(3,7,18,0) 70%)",
          }}
        />

        {/* Auth bar */}
        {authLoaded && cloudConfigured && (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {isSignedIn ? (
              <>
                <span className="text-xs text-gray-400 hidden sm:inline">
                  {userEmail ?? userName ?? ""}
                </span>
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: "h-8 w-8",
                    },
                  }}
                />
              </>
            ) : (
              <div className="flex items-center gap-2">
                <SignInButton mode="modal">
                  <button className="rounded-full border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-400 hover:text-white">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500">
                    Sign up
                  </button>
                </SignUpButton>
              </div>
            )}
          </div>
        )}

        {/* Logo */}
        <div className="relative z-10 space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 64 64"
            >
              <path d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M46 20l-6 12 6 12" stroke="#a5b4fc" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            DocSnap
          </h1>
          <p className="max-w-sm text-gray-400 leading-relaxed">
            Snap a document with your camera and download it as a PDF —
            instantly, no account needed.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="relative z-10 mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {[
            { icon: "📷", label: "Scan or import" },
            { icon: "✂️", label: "Auto-crop & deskew" },
            { icon: "🔍", label: "Searchable PDFs" },
            { icon: "☁️", label: "Optional cloud sync" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2.5 text-sm text-gray-300"
            >
              <span className="text-lg">{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="relative z-10 mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={onOpenCamera}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
              />
            </svg>
            Open Camera
          </button>
          <button
            onClick={onChoosePhotos}
            className="inline-flex items-center gap-2 rounded-full border border-gray-600 bg-gray-800 px-8 py-4 text-lg font-semibold text-gray-200 shadow-lg transition-all hover:border-gray-400 hover:bg-gray-700 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            Choose from Photos
          </button>
        </div>

        {/* Sign-in prompt */}
        {authLoaded && cloudConfigured && !isSignedIn && (
          <p className="relative z-10 mt-6 text-xs text-gray-500">
            <SignInButton mode="modal">
              <button className="underline hover:text-gray-300 transition">
                Sign in to save your scans to the cloud
              </button>
            </SignInButton>
          </p>
        )}

        {/* My Scans */}
        {isSignedIn && cloudConfigured && (
          <div className="relative z-10 mt-6 w-full max-w-md border-t border-gray-800 pt-6">
            {!showMyScans ? (
              <button
                onClick={onToggleMyScans}
                className="inline-flex items-center gap-2 rounded-full border border-gray-600 bg-gray-800 px-5 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-400 hover:bg-gray-700 active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                My Scans ({savedDocs.length})
              </button>
            ) : (
              <MyScans
                scans={savedDocs}
                loading={loadingDocs}
                deletingDocId={deletingDocId}
                onDownload={onDownloadDoc}
                onDelete={onDeleteDoc}
                onClose={onCloseMyScans}
              />
            )}
          </div>
        )}

        {/* Privacy notice */}
        {isSignedIn && cloudConfigured && (
          <p className="relative z-10 mt-4 max-w-xs text-xs text-gray-600">
            When you save to cloud, your document is securely stored via Uploadthing.
            Your documents remain private and accessible only to you.
          </p>
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-center gap-6 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/privacy" className="transition hover:text-gray-400">
          Privacy
        </Link>
        <Link to="/about" className="transition hover:text-gray-400">
          About
        </Link>
      </footer>
    </div>
  );
}
