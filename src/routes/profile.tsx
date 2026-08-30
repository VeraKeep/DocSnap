import { createFileRoute, Link } from "@tanstack/react-router";
import { useClerk, useUser } from "@clerk/tanstack-start";
import { useCloudSync } from "../hooks/useCloudSync";
import { useSubscription } from "../hooks/useSubscription";
import type { Tier } from "../subscription";

const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  personal: "Personal",
  family: "Family",
};

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: 'Your Profile — DocSnap © 2026' },
      { name: "description", content: 'Manage your DocSnap © 2026 account — view storage usage, subscription plan, synced documents, and secure account settings.' },
    ],
    links: [{ rel: "canonical", href: "https://docsnapapp.com/profile" }],
  }) ,
  component: ProfilePage,
});

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M46 20l-6 12 6 12" stroke="#a5b4fc" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ProfilePage() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { myScans, loadingDocs } = useCloudSync();
  const { tier, isPro, isLoading: subscriptionLoading, upgradeUrl, portalUrl } = useSubscription();
  const planLabel = TIER_LABELS[tier];

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "DocSnap © 2026 user";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const countLabel = isPro
    ? `${myScans.length} ${myScans.length === 1 ? "document" : "documents"} · Unlimited`
    : `${myScans.length} / 25 documents`;

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400">
          <Logo />
          DocSnap © 2026
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/garage"
            className="text-sm text-gray-400 transition hover:text-indigo-400"
          >
            Garage
          </Link>
          <Link to="/" className="text-sm text-gray-400 transition hover:text-gray-200">
            ← Back to app
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div>
          <p className="text-sm font-medium text-indigo-400">Account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your profile</h1>
          <p className="mt-3 text-gray-400">Manage your account and keep an eye on your DocSnap © 2026 storage.</p>
        </div>

        {!isLoaded ? (
          <div className="mt-10 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading profile" />
        ) : !user ? (
          <div className="mt-10 rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
            <h2 className="font-semibold">Sign in to view your profile</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">Your profile and cloud documents are available after signing in.</p>
            <Link to="/" className="mt-5 inline-flex rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-indigo-500">Back to app</Link>
          </div>
        ) : (
          <div className="mt-10 space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
              {user.imageUrl ? (
                <img src={user.imageUrl} alt={`${name}'s avatar`} className="h-16 w-16 rounded-full object-cover ring-2 ring-gray-800" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/30 text-lg font-semibold text-indigo-200 ring-2 ring-indigo-500/30" aria-hidden="true">{initials}</div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{name}</h2>
                {user.primaryEmailAddress?.emailAddress && <p className="mt-1 truncate text-sm text-gray-400">{user.primaryEmailAddress.emailAddress}</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-400">Plan</p>
                  <div className="mt-2 flex items-center gap-3">
                    <h2 className="text-xl font-semibold">{subscriptionLoading ? "Checking…" : planLabel}</h2>
                    {!subscriptionLoading && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPro ? "bg-indigo-500/20 text-indigo-300" : "bg-gray-800 text-gray-300"}`}>{planLabel}</span>}
                  </div>
                </div>
                {!subscriptionLoading && !isPro && <Link to={upgradeUrl} className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold transition hover:bg-indigo-500">Upgrade</Link>}
                {!subscriptionLoading && isPro && (portalUrl ? <a href={portalUrl} className="shrink-0 rounded-full border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/10">Manage Subscription</a> : <span title="Billing portal coming soon" className="shrink-0 cursor-not-allowed rounded-full border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-500">Manage Subscription</span>)}
              </div>
              <div className="mt-6 border-t border-gray-800 pt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Cloud storage</span>
                  <span className="font-medium text-gray-200">{loadingDocs ? "Loading…" : countLabel}</span>
                </div>
                {!isPro && <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min((myScans.length / 25) * 100, 100)}%` }} /></div>}
                <p className="mt-3 text-xs text-gray-500">Your scanned documents stay synced and available across your devices.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
              <h2 className="font-semibold">Account settings</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">Update your personal details, security settings, or delete your account through Clerk’s secure account center.</p>
              <button type="button" onClick={() => clerk.openUserProfile()} className="mt-5 inline-flex items-center rounded-full border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:bg-gray-800">
                Manage account
                <span className="ml-2" aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="border-t border-gray-800/50 py-5 text-center text-xs text-gray-600">DocSnap © 2026 — one place for the important stuff you own and the documents that go with it</footer>
    </main>
  );
}
