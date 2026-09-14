import { Link } from "@tanstack/react-router";
import { SignInButton, SignUpButton, UserButton } from "@clerk/tanstack-start";
import { trackEvent } from "../analytics";
import { MODULES } from "../modules";
import { MeetingSnapTiers } from "./MeetingSnapTiers";
import { HomeSnapLaunchBanner } from "../features/homesnap/components/HomeSnapLaunchBanner";
import { MyScans } from "./MyScans";
import type { CloudDocument, DocCategory } from "../cloudTypes";
import { ModuleBrandIcon, ModuleWordmark, moduleAccent } from "./ModuleBrandIcon";

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
  docLimit: number;
  isPro: boolean;
  upgradeUrl: string;
  showUpgradeBanner: boolean;
  onDismissUpgradeBanner: () => void;
  onOpenCamera: () => void;
  onChoosePhotos: () => void;
  onToggleMyScans: () => void;
  onCloseMyScans: () => void;
  onDownloadDoc: (doc: CloudDocument) => void;
  onDeleteDoc: (docId: string) => void;
  onCategoryChange: (docId: string, cat: DocCategory) => void;
}

function RecentDocuments({ docs, loading, deletingDocId, onDownload, onDelete }: {
  docs: CloudDocument[];
  loading: boolean;
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
}) {
  const recent = docs.slice(0, 3);
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-slate-950/60 p-4 text-left shadow-xl shadow-black/20 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Recent documents</h3>
        <span className="text-xs text-slate-500">{docs.length} saved</span>
      </div>
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">Loading your scans…</div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
          Your recent scans will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">PDF</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">{doc.name}</p>
                <p className="text-xs text-slate-500">{doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"} · {new Date(doc.date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => onDownload(doc)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">↓</button>
              <button onClick={() => onDelete(doc.id)} disabled={deletingDocId === doc.id} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-40">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NavBrand() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="DocSnap home">
      <ModuleBrandIcon name="DocSnap" size={42} />
      <div className="leading-none">
        <ModuleWordmark name="DocSnap" className="text-xl" />
        <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">A VeraKeep product</div>
      </div>
    </Link>
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
    <div className="min-h-screen bg-[#020914] text-white">
      <div className="fixed inset-0 -z-0 bg-[radial-gradient(circle_at_15%_15%,rgba(0,191,255,.12),transparent_32%),radial-gradient(circle_at_85%_25%,rgba(0,119,255,.11),transparent_30%),linear-gradient(135deg,#020914_0%,#06182b_50%,#031020_100%)]" />

      <header className="sticky top-0 z-40 border-b border-cyan-400/10 bg-[#020914]/88 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-5 px-4 sm:px-6">
          <NavBrand />
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="transition hover:text-cyan-300">Features</a>
            <a href="#modules" className="transition hover:text-cyan-300">Modules</a>
            <Link to="/pricing" className="transition hover:text-cyan-300">Pricing</Link>
            <Link to="/faq" className="transition hover:text-cyan-300">Resources</Link>
          </nav>
          <div className="flex items-center gap-2">
            {authLoaded && cloudConfigured && isSignedIn ? (
              <>
                <span className="hidden text-xs text-slate-500 lg:inline">{userEmail ?? userName ?? ""}</span>
                <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }} />
              </>
            ) : authLoaded && cloudConfigured ? (
              <>
                <SignInButton mode="modal"><button onClick={() => trackEvent("sign-in")} className="hidden rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/60 hover:text-white sm:inline-flex">Sign in</button></SignInButton>
                <SignUpButton mode="modal"><button onClick={() => trackEvent("sign-up")} className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300">Get started</button></SignUpButton>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.02fr_.98fr] lg:pb-24 lg:pt-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Scan · Organize · Find · Done</p>
            <h1 className="mt-5 text-5xl font-black leading-[.95] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">
              Your life,<br/><span className="bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent">documented.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              DocSnap helps you capture, organize, search, and keep the documents and records that make everyday life run smoothly.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onOpenCamera} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-300">Open camera →</button>
              <button onClick={onChoosePhotos} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-slate-900/60 px-6 py-3.5 text-sm font-bold text-slate-100 transition hover:border-cyan-400/50 hover:bg-slate-800">Choose photos</button>
              <a href="#modules" className="inline-flex items-center rounded-xl px-4 py-3.5 text-sm font-semibold text-cyan-300 hover:text-cyan-200">Explore modules ↓</a>
            </div>
            <p className="mt-4 text-xs text-slate-500">Free to start · No credit card required · Local scanning available without an account</p>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-slate-900/90 to-slate-950/80 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
              <div className="flex flex-col items-center text-center">
                <ModuleBrandIcon name="DocSnap" size={116} />
                <div className="mt-6"><ModuleWordmark name="DocSnap" className="text-5xl sm:text-6xl" /></div>
                <div className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400"><img src="/verakeep-mark.svg" alt="" className="h-6 w-6 rounded-md"/> A VeraKeep product</div>
              </div>
              <div id="features" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["▣", "Scan"], ["□", "Organize"], ["⌕", "Find"], ["✓", "Done"],
                ].map(([icon, label]) => (
                  <div key={label} className="rounded-xl border border-cyan-500/15 bg-slate-900/70 px-3 py-4 text-center">
                    <div className="text-xl text-cyan-300">{icon}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {showUpgradeBanner && !isPro && (
          <section className="mx-auto max-w-4xl px-6 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-4">
              <div><p className="font-semibold text-cyan-100">Want more from each scan?</p><p className="text-sm text-slate-400">Unlock cloud history and premium document tools.</p></div>
              <div className="flex items-center gap-2"><Link to="/pricing" className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">See plans</Link><button onClick={onDismissUpgradeBanner} className="px-2 py-2 text-sm text-slate-500">×</button></div>
            </div>
          </section>
        )}

        {isSignedIn && cloudConfigured && (
          <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-12 lg:grid-cols-2">
            {!showMyScans ? (
              <RecentDocuments docs={savedDocs} loading={loadingDocs} deletingDocId={deletingDocId} onDownload={onDownloadDoc} onDelete={onDeleteDoc} />
            ) : (
              <div className="lg:col-span-2"><MyScans scans={savedDocs} loading={loadingDocs} deletingDocId={deletingDocId} docLimit={docLimit} isPro={isPro} upgradeUrl={upgradeUrl} onDownload={onDownloadDoc} onDelete={onDeleteDoc} onClose={onCloseMyScans} onCategoryChange={onCategoryChange} /></div>
            )}
            {!showMyScans && <button onClick={onToggleMyScans} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-5 text-left transition hover:border-cyan-500/30"><span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Your library</span><div className="mt-2 text-xl font-bold">Open My Scans →</div><p className="mt-1 text-sm text-slate-500">Search and manage all {savedDocs.length} saved documents.</p></button>}
          </section>
        )}

        <section id="modules" className="border-y border-cyan-400/10 bg-[#04101d]/80 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <HomeSnapLaunchBanner />
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">One account. Focused tools.</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Snap the right tool onto DocSnap.</h2>
              <p className="mt-4 text-slate-400">Each module keeps the same VeraKeep design language while staying focused on one real-world job.</p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MODULES.map((m) => {
                const accent = moduleAccent(m.name);
                return (
                  <article key={m.name} className="group flex min-h-[360px] flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900/85 to-slate-950/95 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-1" style={{ borderColor: `${accent}45` }}>
                    <div className="flex items-center justify-between">
                      <ModuleBrandIcon name={m.name as any} size={58} />
                      <span className="rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest" style={{ borderColor: `${accent}40`, color: accent }}>Live</span>
                    </div>
                    <div className="mt-5"><ModuleWordmark name={m.name as any} className="text-2xl" /></div>
                    <p className="mt-2 text-sm font-semibold" style={{ color: accent }}>{m.tagline}</p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{m.description}</p>
                    <div className="mt-5 flex items-baseline gap-1"><span className="text-2xl font-extrabold">{m.priceMonthly}</span><span className="text-xs text-slate-500">/month</span></div>
                    <div className="mt-4 flex flex-col gap-2">
                      {!m.comingSoon && m.checkout.monthly ? <a href={m.checkout.monthly} className="rounded-xl px-4 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:brightness-110" style={{ backgroundColor: accent }}>Get {m.name}</a> : <span className="rounded-xl border border-slate-700 px-4 py-2.5 text-center text-sm font-semibold text-slate-500">Pricing coming soon</span>}
                      {!m.comingSoon && <Link to={m.route} className="rounded-xl border border-slate-700 px-4 py-2.5 text-center text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white">Open {m.name}</Link>}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600"><img src="/verakeep-mark.svg" alt="" className="h-4 w-4 rounded"/> A VeraKeep product</div>
                  </article>
                );
              })}
            </div>
            <MeetingSnapTiers />
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-8 text-center shadow-2xl shadow-black/30 sm:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">VeraKeep All Access</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">The whole DocSnap suite, one plan.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">DocSnap Personal plus all seven live modules — one account and one place for the records that matter.</p>
            <Link to="/pricing" className="mt-7 inline-flex rounded-xl bg-cyan-400 px-7 py-3.5 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-300">See All Access pricing →</Link>
          </div>
        </section>

        {authLoaded && cloudConfigured && !isSignedIn && (
          <section className="px-6 pb-16">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-black">Ready when you are.</h2>
              <p className="mt-3 text-slate-400">Create a free account to keep scans in your library and connect them to the rest of the VeraKeep suite.</p>
              <SignUpButton mode="modal"><button onClick={() => trackEvent("sign-up")} className="mt-6 rounded-xl bg-cyan-400 px-7 py-3.5 text-sm font-extrabold text-slate-950">Create your free account</button></SignUpButton>
            </div>
          </section>
        )}
      </main>

      <Link to="/contact" className="fixed bottom-5 right-5 z-40 rounded-full border border-cyan-400/20 bg-slate-950/90 px-4 py-2 text-xs font-semibold text-slate-400 shadow-xl backdrop-blur hover:text-cyan-300">Send feedback</Link>

      <footer className="relative z-10 border-t border-cyan-400/10 bg-[#020914] px-6 py-7">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <div className="flex items-center gap-3"><img src="/verakeep-mark.svg" alt="VeraKeep" className="h-8 w-8 rounded-lg"/><div><div className="font-bold">VeraKeep</div><div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Practical tools for real life</div></div></div>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <Link to="/privacy" className="hover:text-slate-300">Privacy</Link><Link to="/terms" className="hover:text-slate-300">Terms</Link><Link to="/contact" className="hover:text-slate-300">Contact</Link><Link to="/faq" className="hover:text-slate-300">FAQ</Link><Link to="/status" className="hover:text-slate-300">Status</Link><Link to="/about" className="hover:text-slate-300">About</Link><Link to="/pricing" className="hover:text-cyan-300">Pricing</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
