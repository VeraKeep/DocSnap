import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  getReceipt,
  getReceiptsEntitlement,
  listReceipts,
  saveReceipt,
  searchReceipts,
} from "../server";
import { type ReceiptDetail, type ReceiptSummary } from "../types";
import { ReceiptDetailModal } from "./ReceiptDetail";
import { ReceiptRow } from "./ReceiptRow";

const SEARCH_DELAY_MS = 250;

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** Sign-in gate — shown to anonymous visitors (and whenever Clerk is unconfigured). */
function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 text-indigo-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2Z"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to view your receipts</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        Your receipts are private to your DocSnap account. After signing in
        you'll see your full receipt library — searchable by merchant, item,
        serial number, or warranty.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in
        </button>
      </SignInButton>
      <p className="mt-4 text-xs text-gray-600">
        Receipts can't be accessed without signing in.
      </p>
    </div>
  );
}

/** Honest error card for DB-unconfigured / failed-load states. */
function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-relaxed text-amber-200">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-900/40"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/** Transient status banner (success, open failures, etc.). */
function Notice({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div
      role="status"
      className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 px-5 py-4 text-sm text-indigo-200"
    >
      {children}
    </div>
  );
}

/**
 * Locked / upgrade screen — shown to a signed-in user WITHOUT the ReceiptSnap
 * add-on. ReceiptSnap is a paid add-on sold on the DocSnap side and is NOT
 * bundled into any tier, so even a Personal/Household/Complete subscriber sees
 * this until they own the add-on. The buy link is /pricing for now; the real
 * checkout link comes from the owner later.
 */
function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 text-indigo-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold">ReceiptSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        ReceiptSnap isn't included in DocSnap plans — it's a separate add-on.
        Purchase it to store and search your receipts forever.
      </p>
      <Link
        to="/pricing"
        className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        See plans &amp; buy ReceiptSnap
      </Link>
      <p className="mt-4 text-xs text-gray-600">
        Your receipts stay private to your DocSnap account.
      </p>
    </div>
  );
}

/**
 * ReceiptSnap read-only library: receipt list, search, detail modal, and the
 * capture/save flow. Every state is honest — auth gate, loading, empty,
 * DB-unconfigured, extraction-unauthorized, and errors are rendered distinctly,
 * and no placeholder rows are ever fabricated.
 */
export function ReceiptLibrary() {
  const { user, isLoaded } = useUser();

  // Library state
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ReceiptDetail | null>(null);
  const [notice, setNotice] = useState("");
  // ReceiptSnap add-on entitlement: null = resolving, true = unlocked,
  // false = locked (show the upgrade screen).
  const [entitled, setEntitled] = useState<boolean | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (term: string) => {
    setSearching(true);
    try {
      const result = term.trim()
        ? await searchReceipts({ data: { query: term } })
        : await listReceipts();
      setConfigured(result.configured);
      setReceipts(result.receipts as ReceiptSummary[]);
      setStatus("ready");
      setLoadError("");
    } catch (error) {
      setStatus("error");
      setLoadError(
        messageFromError(error, "Your receipts could not be loaded. Please try again."),
      );
    } finally {
      setSearching(false);
    }
  }, []);

  // Initial load once signed in; also a safe mount path when the session is
  // already established at hydration time. First resolve the add-on
  // entitlement: a user without the ReceiptSnap add-on sees the locked screen
  // and never loads the library.
  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getReceiptsEntitlement().then((result) => {
      const has = result.configured && result.hasAddon;
      setEntitled(has);
      if (has) void load("");
    }).catch(() => {
      setEntitled(false);
      setStatus("error");
      setLoadError("ReceiptSnap couldn't be unlocked right now. Please try again.");
    });
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [user, load]);

  function handleSearchChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = value;
    searchTimer.current = setTimeout(() => void load(term), SEARCH_DELAY_MS);
  }

  function clearSearch() {
    setQuery("");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    void load("");
  }

  async function openReceipt(summary: ReceiptSummary) {
    setNotice("");
    try {
      const result = await getReceipt({ data: { id: summary.id } });
      if (!result.configured) {
        setNotice("Storage isn't connected yet — this receipt could not be opened.");
        return;
      }
      if (!result.receipt) {
        setNotice("This receipt could not be opened. It may no longer be available.");
        return;
      }
      setSelected(result.receipt as ReceiptDetail);
    } catch (error) {
      setNotice(messageFromError(error, "This receipt could not be opened. Please try again."));
    }
  }

  function chooseFile(f?: File | null) {
    setUploadError("");
    setUploaded("");
    if (!f || !f.type.startsWith("image/")) {
      setUploadError("Please choose an image file (JPG, PNG, or WebP).");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setUploadError("");
  }

  async function submitUpload() {
    if (!file) {
      setUploadError("Choose a receipt image first.");
      return;
    }
    setBusy(true);
    setUploadError("");
    setUploaded("");
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () =>
          reject(reader.error ?? new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      await saveReceipt({ data: { imageBase64, mimeType: file.type } });
      clearFile();
      setUploaded("Receipt saved to your library.");
      setQuery("");
      await load("");
    } catch (error) {
      setUploadError(
        messageFromError(error, "The receipt could not be saved. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) {
    return (
      <div
        className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60"
        aria-label="Loading receipts"
      />
    );
  }

  if (!user) {
    return <SignInRequired />;
  }

  // Entitlement gate UI: locked users (including paid tiers without the
  // add-on) never see the library — only the add-on upgrade screen.
  if (entitled === null) {
    return (
      <div
        className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60"
        aria-label="Loading receipts"
      />
    );
  }
  if (!entitled) {
    return <AddonLocked />;
  }

  const countLabel = searching
    ? "Searching…"
    : query.trim()
      ? `${receipts.length} ${receipts.length === 1 ? "result" : "results"} for "${query.trim()}"`
      : `${receipts.length} ${receipts.length === 1 ? "receipt" : "receipts"}`;

  const emptyLabel = !configured
    ? "Receipts will appear here once storage is connected."
    : query.trim()
      ? `No receipts match "${query.trim()}".`
      : "Your receipts will appear here. Upload your first receipt above — its details are extracted automatically.";

  return (
    <div className="mt-8 space-y-8">
      <Notice>{notice}</Notice>

      {status === "error" && (
        <ErrorCard message={loadError} onRetry={() => void load(query)} />
      )}
      {status === "ready" && !configured && (
        <ErrorCard
          message="Storage isn't connected yet — receipts can't be loaded or saved right now."
          onRetry={() => void load("")}
        />
      )}

      {/* Upload / capture */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Add a receipt</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a photo — AI extracts the merchant, date, items, serial
          numbers, and warranty info.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            chooseFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-5 text-center transition hover:border-indigo-500/60"
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => chooseFile(e.target.files?.[0])}
          />
          {preview ? (
            <img
              src={preview}
              alt="Receipt preview"
              className="mx-auto max-h-64 rounded-xl object-contain"
            />
          ) : (
            <>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800 text-xl text-gray-300">
                ↑
              </div>
              <p className="mt-3 text-sm font-medium text-gray-200">
                Drop a receipt image here
              </p>
              <p className="mt-1 text-xs text-gray-500">
                or click to browse · JPG, PNG, or WebP
              </p>
            </>
          )}
        </div>
        {file && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="text-xs text-gray-500 transition hover:text-gray-300"
            >
              Remove image
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={!file || busy}
          onClick={submitUpload}
          className="mt-4 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Reading your receipt…" : "Extract receipt details"}
        </button>
        {uploadError && (
          <p role="alert" className="mt-3 text-center text-sm text-red-400">
            {uploadError}
          </p>
        )}
        {uploaded && (
          <p role="status" className="mt-3 text-center text-sm text-indigo-300">
            {uploaded}
          </p>
        )}
        <p className="mt-3 text-center text-xs text-gray-600">
          Your image is sent securely for extraction and stored with your receipt.
        </p>
      </section>

      {/* Library: search + list */}
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Your receipts</h2>
            <p className="mt-1 text-sm text-gray-500">{countLabel}</p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search receipts</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Find my refrigerator receipt…"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {status === "loading" ? (
            <div className="space-y-3" aria-label="Loading receipts">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60"
                />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              Receipts are unavailable right now. Check the message above and try again.
            </div>
          ) : receipts.length ? (
            <div className="space-y-3">
              {receipts.map((receipt) => (
                <ReceiptRow key={receipt.id} receipt={receipt} onOpen={openReceipt} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              {emptyLabel}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <ReceiptDetailModal receipt={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
