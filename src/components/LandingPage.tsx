import { Link } from "@tanstack/react-router";
import { SignInButton, SignUpButton, UserButton } from "@clerk/tanstack-start";
import { trackEvent } from "../analytics";
import { MODULES } from "../modules";
import { MyScans } from "./MyScans";
import {
  type CloudDocument,
  type DocCategory,
  getDocCategory,
} from "../cloudTypes";

// ── Folder config for badges ────────────────────────────────────────

const BADGE_STYLES: Record<DocCategory, string> = {
  Receipts: "bg-emerald-900/60 text-emerald-400 border-emerald-700/60",
  Insurance: "bg-blue-900/60 text-blue-400 border-blue-700/60",
  Taxes: "bg-red-900/60 text-red-400 border-red-700/60",
  Medical: "bg-purple-900/60 text-purple-400 border-purple-700/60",
  School: "bg-orange-900/60 text-orange-400 border-orange-700/60",
  Military: "bg-lime-900/60 text-lime-400 border-lime-700/60",
  Manuals: "bg-gray-800 text-gray-300 border-gray-700",
  Uncategorized: "bg-gray-800/60 text-gray-500 border-gray-700/60",
};

const BADGE_EMOJI: Record<DocCategory, string> = {
  Receipts: "📄",
  Insurance: "🛡️",
  Taxes: "💰",
  Medical: "🏥",
  School: "🎓",
  Military: "🪖",
  Manuals: "📖",
  Uncategorized: "📁",
};

const BADGE_LABEL: Record<DocCategory, string> = {
  Receipts: "Receipts",
  Insurance: "Insurance",
  Taxes: "Taxes",
  Medical: "Medical",
  School: "School",
  Military: "Military",
  Manuals: "Manuals",
  Uncategorized: "Uncategorized",
};

function SmallBadge({ category }: { category: DocCategory }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-medium ${BADGE_STYLES[category]}`}
    >
      <span className="text-[10px] leading-none">{BADGE_EMOJI[category]}</span>
      <span>{BADGE_LABEL[category]}</span>
    </span>
  );
}

// ── Props ───────────────────────────────────────────────────────────

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
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** Whether the user has a Pro subscription */
  isPro: boolean;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  /** Whether to show the upgrade banner after OCR completion */
  showUpgradeBanner: boolean;
  /** Dismiss the upgrade banner */
  onDismissUpgradeBanner: () => void;
  onOpenCamera: () => void;
  onChoosePhotos: () => void;
  onToggleMyScans: () => void;
  onCloseMyScans: () => void;
  onDownloadDoc: (doc: CloudDocument) => void;
  onDeleteDoc: (docId: string) => void;
  onCategoryChange: (docId: string, cat: DocCategory) => void;
}

/** Show the 3 most recent documents as a compact list. */
function RecentDocuments({
  docs,
  loadingDocs,
  deletingDocId,
  onDownload,
  onDelete,
}: {
  docs: CloudDocument[];
  loadingDocs: boolean;
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
}) {
  const recent = docs.slice(0, 3);

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Recent Documents
      </h3>

      {loadingDocs ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 py-6 px-4 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto h-8 w-8 text-gray-700 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="text-sm text-gray-500">Your recent scans will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((doc) => {
            const cat = getDocCategory(doc);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 transition hover:border-gray-700"
              >
                {/* PDF icon thumbnail */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-900/40 text-indigo-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>

                {/* Name + date + badge */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="truncate text-sm font-medium text-gray-200">
                    {doc.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-xs text-gray-500">
                      {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"} · {new Date(doc.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <SmallBadge category={cat} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => onDownload(doc)}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-white"
                    title="Download"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(doc.id)}
                    disabled={deletingDocId === doc.id}
                    className="rounded p-1.5 text-gray-500 transition hover:bg-red-900/40 hover:text-red-400 disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingDocId === doc.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  docLimit,
  isPro,
  upgradeUrl,
  showUpgradeBanner,
  onDismissUpgradeBanner,
  onOpenCamera,
  onChoosePhotos,
  onToggleMyScans,
  onCloseMyScans,
  onDownloadDoc,
  onDeleteDoc,
  onCategoryChange,
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
                <Link
                  to="/garage"
                  className="rounded-full border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-indigo-500 hover:text-white"
                  title="GarageSnap — workshop inventory"
                >
                  Garage
                </Link>
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
                  <button
                    onClick={() => trackEvent("sign-in")}
                    className="rounded-full border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
                  >
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    onClick={() => trackEvent("sign-up")}
                    className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
                  >
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
            DocSnap © 2026
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">Powered by VeraKeep™</p>
          <p className="mx-auto max-w-md text-gray-400 leading-relaxed">
            One place for the important stuff you own and the documents that go
            with it — scan anything to a searchable PDF right in your browser.
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
              <button
                onClick={() => trackEvent("sign-in")}
                className="underline hover:text-gray-300 transition"
              >
                Sign in to save your scans to the cloud
              </button>
            </SignInButton>
          </p>
        )}

        {/* Recent Documents (signed-in users only) */}
        {isSignedIn && cloudConfigured && !showMyScans && (
          <div className="relative z-10 mt-8 w-full max-w-md border-t border-gray-800/50 pt-6">
            <RecentDocuments
              docs={savedDocs}
              loadingDocs={loadingDocs}
              deletingDocId={deletingDocId}
              onDownload={onDownloadDoc}
              onDelete={onDeleteDoc}
            />
          </div>
        )}

        {/* My Scans (full list, toggled) */}
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
                docLimit={docLimit}
                isPro={isPro}
                upgradeUrl={upgradeUrl}
                onDownload={onDownloadDoc}
                onDelete={onDeleteDoc}
                onClose={onCloseMyScans}
                onCategoryChange={onCategoryChange}
              />
            )}
          </div>
        )}

        {/* Upgrade banner after OCR completion */}
        {showUpgradeBanner && !isPro && (
          <div className="relative z-10 mt-8 w-full max-w-md animate-fade-in">
            <div className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-3">
              <span className="text-xl">✨</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-indigo-300">
                  Upgrade to Pro for AI-powered categorization and unlimited storage
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/pricing"
                  className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  Upgrade
                </Link>
                <button
                  onClick={onDismissUpgradeBanner}
                  className="rounded p-1 text-gray-500 transition hover:text-gray-300"
                  title="Dismiss"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
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

      {/* VeraKeep All Access — flagship bundle CTA */}
      <section className="relative border-t border-gray-800/50 px-6 py-16 sm:px-6">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(79,70,229,0.3) 0%, rgba(3,7,18,0) 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl rounded-3xl border border-indigo-500/40 bg-indigo-950/30 p-8 text-center sm:p-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/50 bg-indigo-900/40 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-300">
            ✨ Best value
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Get the whole suite with VeraKeep All Access
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-400">
            One bundle, everything you own. DocSnap Personal + ReceiptSnap +
            GarageSnap + MeetingSnap Personal for one simple price —{" "}
            <span className="font-semibold text-green-400">
              ~33% less than buying separately.
            </span>
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/pricing"
              className="inline-flex items-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 active:scale-95"
            >
              See All Access pricing
            </Link>
            <Link
              to="/meetingsnap-pricing"
              className="inline-flex items-center rounded-full border border-gray-600 bg-gray-800 px-6 py-3.5 text-base font-semibold text-gray-200 transition hover:border-gray-400 hover:bg-gray-700"
            >
              MeetingSnap plans →
            </Link>
          </div>
        </div>
      </section>

      {/* VeraKeep modules */}
      <section className="relative border-t border-gray-800/50 px-6 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            One place for everything you own
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-gray-400">
            The VeraKeep™ suite — modules that snap onto DocSnap to organize the
            receipts, tools, and meetings that go with the things you own.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div
                key={m.name}
                className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 transition hover:border-gray-700"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-900/40 text-2xl">
                  {m.emoji}
                </div>
                <h3 className="mt-4 text-lg font-bold">{m.name}</h3>
                <p className="mt-1 text-sm font-medium text-indigo-300">{m.tagline}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-300">{m.description}</p>

                <div className="mt-6 flex flex-col gap-2">
                  <a
                    href={m.checkout.monthly || "#"}
                    onClick={(e) => {
                      if (!m.checkout.monthly) e.preventDefault();
                    }}
                    className="inline-flex justify-center rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Buy · {m.priceMonthly}/mo
                  </a>
                  <Link
                    to={m.route}
                    className="inline-flex justify-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
                  >
                    Open {m.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiet, always-available feedback link */}
      <Link
        to="/contact"
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-gray-700/80 bg-gray-900/95 px-3 py-2 text-xs font-medium text-gray-400 shadow-lg shadow-black/20 backdrop-blur transition hover:border-gray-500 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:ring-offset-2 focus:ring-offset-gray-950 sm:bottom-6 sm:right-6"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75h6.75m-6.75 3h4.5m-8.25 4.5 1.685-1.685A2.25 2.25 0 0 1 8.15 14.9h7.7a2.25 2.25 0 0 0 2.25-2.25V7.35A2.25 2.25 0 0 0 15.85 5.1h-7.7A2.25 2.25 0 0 0 5.9 7.35v5.3a2.25 2.25 0 0 0 .659 1.591l-1.684 1.685Z" />
        </svg>
        Send feedback
      </Link>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/privacy" className="transition hover:text-gray-400">
          Privacy
        </Link>
        <Link to="/terms" className="transition hover:text-gray-400">
          Terms
        </Link>
        <Link to="/contact" className="transition hover:text-gray-400">
          Contact
        </Link>
        <Link to="/faq" className="transition hover:text-gray-400">
          FAQ
        </Link>
        <Link to="/changelog" className="transition hover:text-gray-400">
          Changelog
        </Link>
        <Link to="/roadmap" className="transition hover:text-gray-400">
          Roadmap
        </Link>
        <Link to="/status" className="transition hover:text-gray-400">
          Status
        </Link>
        <Link to="/about" className="transition hover:text-gray-400">
          About
        </Link>
        <Link to="/pricing" className="transition hover:text-indigo-400">
          Pricing
        </Link>
      </footer>
    </div>
  );
}
