import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import {
  createContract,
  deleteContract,
  getContract,
  getContractsEntitlement,
  listContracts,
  searchContracts,
} from "../server";
import { type ContractDetail, type ContractRow } from "../types";
import { ContractDetailView } from "./ContractDetail";

const SEARCH_DELAY_MS = 250;

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">✍️</div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to track your contracts</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        Your contracts are private to your DocSnap account. After signing in you can upload a
        contract, get the AI plain-language summary, and keep every deadline and renewal on record.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in
        </button>
      </SignInButton>
      <p className="mt-4 text-xs text-gray-600">Contracts can't be accessed without signing in.</p>
    </div>
  );
}

function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">✍️</div>
      <h2 className="mt-5 text-xl font-semibold">ContractSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        ContractSnap isn't included in DocSnap plans — it's a separate add-on. Purchase it to
        upload contracts and know what you agreed to.
      </p>
      <a
        href={MODULE_CHECKOUT_URLS.CONTRACTSNAP_MONTHLY}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        Buy ContractSnap — $4.99/mo
      </a>
      <p className="mt-4 text-xs text-gray-600">Your contracts stay private to your DocSnap account.</p>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5">
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

function dateCell(value: string | null) {
  return value ? (
    <span>{value}</span>
  ) : (
    <span className="text-gray-600">—</span>
  );
}

export function ContractLibrary() {
  const { user, isLoaded } = useUser();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<ContractDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (term: string) => {
    setSearching(true);
    try {
      const result = term.trim()
        ? await searchContracts({ data: { query: term } })
        : await listContracts();
      setConfigured(result.configured);
      setContracts(result.contracts as ContractRow[]);
      setStatus("ready");
      setLoadError("");
    } catch (error) {
      setStatus("error");
      setLoadError(messageFromError(error, "Your contracts could not be loaded. Please try again."));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getContractsEntitlement()
      .then((result) => {
        const has = result.configured && result.hasAddon;
        setEntitled(has);
        if (result.configured) setAiConfigured(result.aiConfigured);
        if (has) void load("");
      })
      .catch(() => {
        setEntitled(false);
        setStatus("error");
        setLoadError("ContractSnap couldn't be unlocked right now. Please try again.");
      });
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

  async function openContract(id: number) {
    setNotice("");
    try {
      const result = await getContract({ data: { id } });
      if (!result.configured) {
        setNotice("Storage isn't connected yet — this contract could not be opened.");
        return;
      }
      if (!result.contract) {
        setNotice("This contract could not be opened. It may no longer be available.");
        return;
      }
      setSelected(result.contract as ContractDetail);
      setSelectedId(id);
      if (result.contract.analysis_status) setAiConfigured((c) => c);
    } catch (error) {
      setNotice(messageFromError(error, "This contract could not be opened. Please try again."));
    }
  }

  function chooseFile(f?: File | null) {
    setUploadError("");
    setUploaded("");
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      setUploadError("Please choose a PDF contract file.");
      return;
    }
    setFile(f);
  }

  async function submitUpload() {
    if (!file) {
      setUploadError("Choose a contract PDF first.");
      return;
    }
    setBusy(true);
    setUploadError("");
    setUploaded("");
    try {
      // Client-side text extraction (no secrets needed). Works for text-based
      // PDFs (and .docx/.txt); scanned-image PDFs fall through with an honest error.
      const { extractFileText } = await import("~/features/meetingsnap/textExtract");
      const sourceText = await extractFileText(file);
      const result = await createContract({
        data: { title: file.name.replace(/\.[^.]+$/, ""), sourceText, fileRef: file.name },
      });
      setConfigured(result.configured);
      setAiConfigured(result.aiConfigured);
      setFile(null);
      if (result.configured && result.contract) {
        setUploaded(
          result.analysisStatus === "complete"
            ? "Contract saved and analyzed — it now appears under Your contracts."
            : "Contract saved. Analysis is pending — the AI backend isn't connected yet, so only the raw text is stored.",
        );
      } else {
        setUploaded("Contract analyzed for this session (storage isn't connected here).");
      }
      setQuery("");
      setSelected(result.contract as ContractDetail);
      setSelectedId(result.contract?.id ?? null);
      await load("");
    } catch (error) {
      setUploadError(
        messageFromError(
          error,
          "The contract could not be read or saved. Please try a PDF with readable text.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeContract(id: number) {
    try {
      await deleteContract({ data: { id } });
      if (selectedId === id) {
        setSelected(null);
        setSelectedId(null);
      }
      await load(query);
    } catch (error) {
      setNotice(messageFromError(error, "That contract could not be deleted."));
    }
  }

  if (!isLoaded) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading contracts" />
    );
  }
  if (!user) return <SignInRequired />;
  if (entitled === null) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading contracts" />
    );
  }
  if (!entitled) return <AddonLocked />;

  const autoRenewCount = contracts.filter((c) => c.auto_renewal === true).length;
  const countLabel = searching
    ? "Searching…"
    : query.trim()
      ? `${contracts.length} ${contracts.length === 1 ? "result" : "results"} for "${query.trim()}"`
      : `${contracts.length} ${contracts.length === 1 ? "contract" : "contracts"}`;

  // Detail is shown above the upload when a contract is open.
  return (
    <div className="mt-8 space-y-8">
      <Notice>{notice}</Notice>

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load(query)} />}
      {status === "ready" && !configured && (
        <ErrorCard
          message="Storage isn't connected yet — contracts can't be loaded or saved right now, but you can still analyze a PDF in this session."
          onRetry={() => void load("")}
        />
      )}

      {!aiConfigured && (
        <p role="status" className="rounded-2xl border border-amber-900/50 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
          The AI backend (OPENAI_API_KEY) isn't connected yet, so uploads will be saved with their
          raw text and marked <strong>Analysis pending</strong> — no summary, clauses, or timeline
          until the team connects AI.
        </p>
      )}

      {/* Selected / freshly-created contract detail */}
      {selected && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contract detail</p>
            <div className="flex items-center gap-3">
              {selected.id > 0 && (
                <button
                  type="button"
                  onClick={() => void removeContract(selected.id)}
                  className="text-xs text-gray-500 transition hover:text-red-400"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSelectedId(null);
                }}
                className="text-xs text-gray-400 transition hover:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>
          <ContractDetailView contract={selected} />
        </section>
      )}

      {/* Upload */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Upload a contract</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a contract PDF — ContractSnap reads the text and extracts the important terms:
          dates, renewals, cancellation windows, payment, obligations, and a plain-language summary.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            chooseFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-6 text-center transition hover:border-indigo-500/60"
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => chooseFile(e.target.files?.[0])}
          />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800 text-xl text-gray-300">
            ⬆️
          </div>
          {file ? (
            <p className="mt-3 text-sm font-medium text-indigo-300">{file.name} ready</p>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium text-gray-200">Drop a contract PDF here</p>
              <p className="mt-1 text-xs text-gray-500">or click to browse · PDF best-effort (text-based)</p>
            </>
          )}
          {file && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setUploadError("");
              }}
              className="mt-2 text-xs text-gray-500 transition hover:text-gray-300"
            >
              Remove file
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={!file || busy}
          onClick={submitUpload}
          className="mt-4 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Reading your contract…" : "Extract contract terms"}
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
          Your contract text is sent securely for extraction and stored with your record.
        </p>
      </section>

      {/* Library: search + list */}
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Your contracts</h2>
            <p className="mt-1 text-sm text-gray-500">{countLabel}</p>
            {autoRenewCount > 0 && (
              <p className="mt-1 text-xs text-amber-300">
                ⏳ {autoRenewCount} contract{autoRenewCount === 1 ? "" : "s"} auto-renew{autoRenewCount === 1 ? "s" : ""} — try searching "auto-renew" to find them.
              </p>
            )}
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search contracts</span>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search contracts, terms, dates…"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-3 pr-10 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300"
              >
                ✕
              </button>
            )}
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {status === "loading" ? (
            <div className="space-y-3" aria-label="Loading contracts">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              Contracts are unavailable right now. Check the message above and try again.
            </div>
          ) : contracts.length ? (
            contracts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void openContract(c.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-left transition hover:border-indigo-500/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-200">{c.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    {c.contract_type && <span>{c.contract_type}</span>}
                    {c.analysis_status === "pending" && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                        Analysis pending
                      </span>
                    )}
                  </span>
                </span>
                <span className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span>
                    <span className="block text-[10px] text-gray-600">Effective</span>
                    {dateCell(c.effective_date)}
                  </span>
                  <span>
                    <span className="block text-[10px] text-gray-600">Renewal</span>
                    {dateCell(c.renewal_date)}
                  </span>
                  <span>
                    <span className="block text-[10px] text-gray-600">Expires</span>
                    {dateCell(c.expiration_date)}
                  </span>
                </span>
                {c.auto_renewal === true && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    Auto-renews
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              {query.trim()
                ? `No contracts match "${query.trim()}".`
                : "Your contracts will appear here. Upload your first contract above — its terms are extracted automatically."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
