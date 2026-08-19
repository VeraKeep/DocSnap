import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { SignInButton, UserButton } from "@clerk/tanstack-start";
import { nextAssetId, type Asset, type DocumentRef } from "~/assetStorage";
import type { CloudDocument } from "~/cloudStorage";
import { useAssetSync } from "~/hooks/useAssetSync";

export const Route = createFileRoute("/garage")({
  head: () => ({
    meta: [
      { title: "GarageSnap — Workshop Inventory | DocSnap" },
      {
        name: "description",
        content:
          "GarageSnap, a DocSnap module — remember every tool and piece of equipment you own, where it lives, and the manuals, receipts, and warranties that go with it.",
      },
    ],
  }),
  component: GaragePage,
});

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17"
          stroke="#fff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M46 20l-6 12 6 12"
          stroke="#a5b4fc"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function GaragePage() {
  // Assets come from the sync hook: localStorage seed/fallback when
  // unauthenticated (clearly demo data), per-user server store when signed in
  // and cloud-configured (per-user JSON via the verified Clerk session).
  const {
    assets,
    authLoaded,
    isSignedIn,
    isCloudReady,
    cloudActive,
    loadingCloud,
    uploading,
    user,
    documents,
    saveAsset,
    removeAsset,
    uploadPhoto,
  } = useAssetSync();

  const userEmailLabel = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "";

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(
    () =>
      assets.filter((a) =>
        `${a.name} ${a.brand} ${a.category} ${a.location} ${a.serial}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [assets, query],
  );

  const locationCount = useMemo(
    () => new Set(assets.map((a) => a.location.trim()).filter(Boolean)).size,
    [assets],
  );
  const attentionCount = useMemo(
    () => assets.filter((a) => a.status === "Needs attention").length,
    [assets],
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2600);
  };

  const openDocument = (asset: Asset) => {
    if (asset.documentRef?.fileUrl) {
      window.open(asset.documentRef.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    showNotice(
      "Document preview is a demo — attach a DocSnap document to open it here",
    );
  };

  const handleDelete = async (asset: Asset) => {
    if (confirmDeleteId !== asset.id) {
      setConfirmDeleteId(asset.id);
      return;
    }
    const ok = await removeAsset(asset.id);
    setSelected(null);
    setConfirmDeleteId(null);
    showNotice(ok ? "Asset deleted" : "Couldn't delete — try again");
  };

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* App-shell header (DocSnap conventions) */}
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <Logo />
          DocSnap
        </Link>
        <div className="flex items-center gap-3">
          {authLoaded && isCloudReady && (
            <>
              {isSignedIn ? (
                <>
                  <span className="hidden text-xs text-gray-400 sm:inline">
                    {userEmailLabel}
                  </span>
                  <UserButton
                    appearance={{
                      elements: { userButtonAvatarBox: "h-7 w-7" },
                    }}
                  />
                </>
              ) : (
                <SignInButton mode="modal">
                  <button className="rounded-full border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-400 hover:text-white">
                    Sign in to sync
                  </button>
                </SignInButton>
              )}
            </>
          )}
          <Link
            to="/"
            className="text-sm text-gray-400 transition hover:text-gray-200"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-400">
              GarageSnap · Workshop inventory
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything in its place.
            </h1>
            <p className="mt-3 max-w-xl text-gray-400">
              A clear memory for every tool, machine, and piece of equipment —
              photos, storage locations, and the manuals and warranties that go
              with them.
            </p>
          </div>
          <button
            onClick={() => {
              setAdding(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 active:scale-95"
          >
            <span className="text-base leading-none">+</span> Add asset
          </button>
        </div>

        {/* Sync / storage status — honest about what is wired */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-400">
          {cloudActive ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Synced to your DocSnap account
            </>
          ) : loadingCloud ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Loading your cloud assets…
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Saved on this device · demo data
            </>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-2xl font-bold text-white">{assets.length}</p>
            <p className="text-xs text-gray-500">Total assets</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-2xl font-bold text-white">{locationCount}</p>
            <p className="text-xs text-gray-500">Locations</p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-3 ${
              attentionCount > 0
                ? "border-amber-700/50 bg-amber-950/30"
                : "border-gray-800 bg-gray-900/60"
            }`}
          >
            <p
              className={`text-2xl font-bold ${
                attentionCount > 0 ? "text-amber-400" : "text-white"
              }`}
            >
              {attentionCount}
            </p>
            <p className="text-xs text-gray-500">Needs attention</p>
          </div>
        </div>

        {/* Search toolbar */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 focus-within:border-gray-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, brand, serial, or location"
              className="w-full min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500 sm:inline">
              ⌘ K
            </kbd>
          </div>
          <button
            onClick={() => showNotice("Filters will be available soon")}
            className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            ☷ Filter
          </button>
        </div>

        {/* Section head */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">
            All assets{" "}
            <span className="ml-1 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
              {filtered.length}
            </span>
          </h2>
          <p className="text-xs text-gray-500">Recently added and updated</p>
        </div>

        {/* Asset grid */}
        {filtered.length > 0 ? (
          <div className="garage-grid mt-4">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelected(asset);
                  setConfirmDeleteId(null);
                }}
                className="garage-card group overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 text-left transition hover:border-gray-600"
              >
                <div className="relative h-36 w-full overflow-hidden bg-gray-800/60">
                  <img
                    src={asset.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <span
                    className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${
                      asset.status === "Needs attention"
                        ? "bg-amber-500/90 text-amber-950"
                        : "bg-emerald-500/90 text-emerald-950"
                    }`}
                  >
                    ● {asset.status}
                  </span>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {asset.category}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-gray-100">
                    {asset.name}
                  </h3>
                  <p className="truncate text-xs text-gray-500">{asset.brand}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-gray-400">
                      ⌖ {asset.location}
                    </span>
                    <span className="shrink-0 text-gray-600 transition group-hover:text-gray-300">
                      ↗
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-800 bg-gray-900/30 px-6 py-12 text-center">
            <p className="text-sm text-gray-400">
              No assets match “{query}”. Try another search.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
            >
              <span className="text-base leading-none">+</span> Add your first
              asset
            </button>
          </div>
        )}

        {/* Honest demo note */}
        <p className="mt-8 text-xs text-gray-600">
          AI suggestions in this module are a clearly labeled demo — real photo
          AI isn’t wired yet. Photos upload to your DocSnap UploadThing
          storage when you’re signed in.
        </p>
      </section>

      {/* Toast */}
      {notice && (
        <div className="garage-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gray-700 bg-gray-900/95 px-4 py-2.5 text-sm text-gray-200 shadow-xl backdrop-blur">
          <span className="mr-1.5 text-emerald-400">✓</span>
          {notice}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="garage-scroll absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-gray-800 bg-gray-950 shadow-2xl"
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900/80 text-gray-300 backdrop-blur transition hover:bg-gray-800 hover:text-white"
              aria-label="Close details"
            >
              ×
            </button>
            <img
              src={selected.image}
              alt=""
              className="h-56 w-full object-cover"
            />
            <div className="px-5 pb-8 pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {selected.category}
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                {selected.name}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {selected.brand}{" "}
                <span
                  className={`ml-1 text-xs font-medium ${
                    selected.status === "Needs attention"
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  ● {selected.status}
                </span>
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Location
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-200">
                    ⌖ {selected.location}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Serial number
                  </p>
                  <p className="mt-1 break-words text-sm font-medium text-gray-200">
                    {selected.serial}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <h4 className="text-xs font-semibold text-gray-300">
                  Warranty
                </h4>
                <p className="mt-1 text-sm text-gray-400">
                  Covered until <span className="font-medium text-gray-200">{selected.warranty}</span>
                </p>
                <button
                  onClick={() => openDocument(selected)}
                  className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                >
                  <span aria-hidden="true">▤</span>
                  <span className="truncate">{selected.document}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <h4 className="text-xs font-semibold text-gray-300">
                  Maintenance
                </h4>
                <p className="mt-1 text-xs text-gray-500">Next service</p>
                <p className="text-sm font-medium text-gray-200">
                  {selected.nextService}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  onClick={() =>
                    showNotice("Edit mode is coming next in GarageSnap")
                  }
                  className="rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Edit asset
                </button>
                <button
                  onClick={() => handleDelete(selected)}
                  className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                    confirmDeleteId === selected.id
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : "border border-gray-700 text-gray-400 hover:border-red-700/60 hover:text-red-400"
                  }`}
                >
                  {confirmDeleteId === selected.id
                    ? "Confirm delete — this removes the asset and its photo"
                    : "Delete asset"}
                </button>
              </div>
              <p className="mt-4 text-[11px] text-gray-600">
                Deleting an asset removes its own photo, never a referenced
                DocSnap document.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add-asset modal — receives the hook's state so saves land in the
          same asset list the grid renders. */}
      {adding && (
        <AddAssetModal
          onClose={() => setAdding(false)}
          cloudActive={cloudActive}
          uploading={uploading}
          documents={documents}
          saveAsset={saveAsset}
          uploadPhoto={uploadPhoto}
        />
      )}
    </main>
  );
}

// ── Add-asset modal ────────────────────────────────────────────────────

interface AddAssetModalProps {
  onClose: () => void;
  cloudActive: boolean;
  uploading: boolean;
  documents: CloudDocument[];
  saveAsset: (asset: Asset) => Promise<boolean>;
  uploadPhoto: (file: File) => Promise<{ fileKey: string; fileUrl: string } | null>;
}

function AddAssetModal({
  onClose,
  cloudActive,
  uploading,
  documents,
  saveAsset,
  uploadPhoto,
}: AddAssetModalProps) {
  const [notice, setNotice] = useState("");
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [docRef, setDocRef] = useState<DocumentRef | null>(null);
  const [saving, setSaving] = useState(false);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2600);
  };

  const pickerAvailable = cloudActive && documents.length > 0;

  const onPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudActive) {
      showNotice(
        "Photo upload needs a signed-in account — using the demo image for now",
      );
      return;
    }
    const result = await uploadPhoto(file);
    if (result) {
      setPhotoUrl(result.fileUrl);
      setPhotoKey(result.fileKey);
      showNotice("Photo uploaded");
    } else {
      showNotice(
        "Photo upload isn't available in this preview — using the demo image",
      );
    }
  };

  const createAsset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const asset: Asset = {
      id: nextAssetId([]),
      name,
      brand: String(data.get("brand") ?? "").trim(),
      category: String(data.get("category") ?? "").trim(),
      location: String(data.get("location") ?? "").trim(),
      serial: String(data.get("serial") ?? "").trim() || "Not recorded",
      image:
        photoUrl ??
        "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=900&q=80",
      imageKey: photoKey ?? undefined,
      status: "In service",
      warranty: "Not recorded",
      nextService: "Add a maintenance date",
      document: docRef?.name || "No document attached",
      documentRef: docRef,
    };
    setSaving(true);
    const ok = await saveAsset(asset);
    setSaving(false);
    if (ok) {
      onClose();
    } else {
      setNotice("Couldn't save to the cloud — check your connection and try again");
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="garage-scroll absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-gray-800 bg-gray-950 shadow-2xl"
      >
        <div className="px-5 pb-8 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                GarageSnap
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">Add an asset</h2>
              <p className="mt-1 text-sm text-gray-400">
                Capture the details now. You can always edit them later.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-gray-400 transition hover:bg-gray-800 hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Demo AI suggestions — clearly labeled, no claim of real vision AI */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-500/25 bg-indigo-950/30 p-3.5">
            <span className="text-lg leading-none" aria-hidden="true">
              ✦
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-indigo-300">
                AI suggestions · demo
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                After a photo is uploaded, GarageSnap can suggest details for
                you to confirm. Real photo AI isn’t wired yet — this is a demo.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAiConfirmed(true);
                  showNotice("Demo suggestions confirmed");
                }}
                className={`mt-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                  aiConfirmed
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/20"
                }`}
              >
                {aiConfirmed ? "Confirmed ✓" : "Try demo"}
              </button>
            </div>
          </div>

          <form onSubmit={createAsset} className="mt-5 space-y-4">
            {/* Photo */}
            <label className="block text-sm font-medium text-gray-300">
              Photo <span className="font-normal text-gray-500">optional</span>
            </label>
            <label
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-gray-700 bg-gray-900/40 px-4 py-5 text-center transition hover:border-gray-500"
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onPhotoChange}
              />
              <span className="text-2xl text-gray-500" aria-hidden="true">
                ▧
              </span>
              <span className="text-sm font-medium text-gray-300">
                {uploading
                  ? "Uploading…"
                  : photoUrl
                    ? "Change photo"
                    : "Upload a photo"}
              </span>
              <span className="text-xs text-gray-600">
                {photoUrl
                  ? "Photo attached ✓"
                  : "or drag and drop · JPG or PNG"}
              </span>
            </label>
            {photoUrl && (
              <img
                src={photoUrl}
                alt=""
                className="h-40 w-full rounded-xl border border-gray-800 object-cover"
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-300">
                  Asset name
                </span>
                <input
                  required
                  name="name"
                  placeholder="e.g. Cordless drill"
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-300">Brand</span>
                <input
                  name="brand"
                  placeholder="e.g. Milwaukee"
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-indigo-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-300">
                  Category
                </span>
                <select
                  name="category"
                  defaultValue="Power tools"
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-indigo-500"
                >
                  <option>Power tools</option>
                  <option>Shop equipment</option>
                  <option>Storage</option>
                  <option>Hand tools</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-300">
                  Location
                </span>
                <input
                  required
                  name="location"
                  placeholder="e.g. Wall 01 · Bay A"
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-indigo-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-300">
                Serial number{" "}
                <span className="font-normal text-gray-500">optional</span>
              </span>
              <input
                name="serial"
                placeholder="Enter serial number"
                className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-indigo-500"
              />
            </label>

            {/* Attached document — real DocSnap CloudDocument picker when
                available; honest manual-label state otherwise. */}
            <label className="block">
              <span className="text-sm font-medium text-gray-300">
                Attached document{" "}
                <span className="font-normal text-gray-500">optional</span>
              </span>
              {pickerAvailable ? (
                <select
                  value={docRef?.docId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setDocRef(null);
                      return;
                    }
                    const doc = documents.find((d) => d.id === id);
                    setDocRef(
                      doc
                        ? { docId: doc.id, name: doc.name, fileUrl: doc.fileUrl }
                        : null,
                    );
                  }}
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-indigo-500"
                >
                  <option value="">No document attached</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    name="document"
                    placeholder="Manual, receipt, or warranty name"
                    onChange={(e) =>
                      setDocRef(
                        e.target.value.trim()
                          ? { name: e.target.value.trim() }
                          : null,
                      )
                    }
                    className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-indigo-500"
                  />
                  <span className="mt-1 block text-[11px] text-gray-600">
                    DocSnap document links appear when you’re signed in with
                    saved documents — for now this stores a reference label
                    only.
                  </span>
                </>
              )}
            </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save asset"} <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
        {notice && (
          <div className="garage-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gray-700 bg-gray-900/95 px-4 py-2.5 text-sm text-gray-200 shadow-xl backdrop-blur">
            <span className="mr-1.5 text-emerald-400">✓</span>
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
