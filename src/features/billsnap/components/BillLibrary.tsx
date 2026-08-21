/**
 * BillSnap — main module UI: Capture → Identify → Extract → Confirm → Track →
 * Remind → Archive, all upload-based and client-driven.
 *
 * Real extraction: when a user uploads a photo (JPG/PNG/WebP), BillSnap sends it
 * to the server's vision extraction (`extractBillFromImage`) and pre-fills the
 * editable Confirm form with the returned vendor, amount due, due date, etc.
 * Every extracted field stays editable. If extraction isn't configured
 * (OPENAI_API_KEY missing) or the bill can't be read, the flow degrades
 * gracefully to the empty editable form with a small "fill this in manually"
 * note — a broken upload path is never shown. PDFs are not rasterized yet, so
 * they open the manual editable form directly. The "Try a sample bill" button
 * loads a realistic Lumbee River EMC electric bill for a keyless demo, and
 * "Load demo series" seeds a 3-bill sample series (clearly demo data) so the
 * change-detection smart feature is visible on the detail.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  createBill,
  extractBillFromImage,
  getBillsEntitlement,
  listBills,
  seedDemoSeries,
  type BillExtraction,
} from "../server";
import { type Bill, type BillDraft, type BillStatus, BILL_CATEGORIES, BILL_STATUSES } from "../types";
import { BillDetailModal } from "./BillDetail";
import { BillRow } from "./BillRow";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2Z" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to track your bills</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        Your bills are private to your DocSnap account. After signing in you'll
        see what you owe and when — due dates, amounts, vendors, and reminders
        in one place.
      </p>
      <SignInButton mode="modal">
        <button type="button" className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500">
          Sign in
        </button>
      </SignInButton>
      <p className="mt-4 text-xs text-gray-600">
        Bills and amounts can't be accessed without signing in.
      </p>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-relaxed text-amber-200">{message}</p>
        <button type="button" onClick={onRetry} className="shrink-0 rounded-full border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-900/40">
          Retry
        </button>
      </div>
    </div>
  );
}

function Notice({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div role="status" className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 px-5 py-4 text-sm text-indigo-200">
      {children}
    </div>
  );
}

function inputCls() {
  return "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
}

/** Image types the base64 vision API reads directly (mirrors billsnap/server.ts). */
const EXTRACTABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Reads a File as base64 (sans the `data:...;base64,` prefix) like ReceiptSnap. */
function readAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Locked/upgrade screen — shown to a signed-in user WITHOUT the BillSnap
 *  add-on. BillSnap is a paid add-on sold on the DocSnap side and is NOT
 *  bundled into any tier, so even a Personal/Household/Complete subscriber sees
 *  this until they own the add-on ($2.99/month or $29.99/year). The buy link is
 *  /pricing, which reads the real checkout URLs from moduleCheckout.ts. */
function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold">BillSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        BillSnap isn't included in DocSnap plans — it's a separate add-on
        ($2.99/month or $29.99/year). Purchase it to track what you owe and
        when across all your bills.
      </p>
      <Link
        to="/pricing"
        className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        See plans &amp; buy BillSnap
      </Link>
      <p className="mt-4 text-xs text-gray-600">
        Your bills stay private to your DocSnap account.
      </p>
    </div>
  );
}

/** Maps server extraction output onto the editable Confirm draft (blank = empty). */
function draftFromExtraction(extracted: BillExtraction): BillDraft {
  return {
    vendor: extracted.vendor ?? "",
    category: extracted.category ?? "",
    account_reference: extracted.account_reference ?? "",
    statement_date: extracted.statement_date ?? "",
    due_date: extracted.due_date ?? "",
    amount_due: extracted.amount_due == null ? "" : String(extracted.amount_due),
    minimum_payment:
      extracted.minimum_payment == null ? "" : String(extracted.minimum_payment),
    billing_period: extracted.billing_period ?? "",
    autopay_status: extracted.autopay_status ?? "Unknown",
  };
}

export function BillLibrary() {
  const { user, isLoaded } = useUser();

  const [bills, setBills] = useState<Bill[]>([]);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Bill | null>(null);
  const [notice, setNotice] = useState("");
  const [entitled, setEntitled] = useState<boolean | null>(null);

  // Confirm form (extracted, all editable)
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<BillDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [seeding, setSeeding] = useState(false);
  // Auto-extraction status while a real upload is being read (blank = idle).
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");

  // Status filter ("All" + the working buckets)
  const [filter, setFilter] = useState<"All" | BillStatus>("All");

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function emptyDraft(): BillDraft {
    return {
      vendor: "",
      category: "",
      account_reference: "",
      statement_date: "",
      due_date: "",
      amount_due: "",
      minimum_payment: "",
      billing_period: "",
      autopay_status: "Unknown",
    };
  }

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listBills();
      setConfigured(result.configured);
      setBills(result.bills as Bill[]);
      setStatus("ready");
      setLoadError("");
    } catch (error) {
      setStatus("error");
      setLoadError(messageFromError(error, "Your bills could not be loaded. Please try again."));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getBillsEntitlement()
      .then((result) => {
        const has = result.configured && result.hasAddon;
        setEntitled(has);
        if (has) void load();
      })
      .catch(() => {
        setEntitled(false);
        setStatus("error");
        setLoadError("BillSnap couldn't be unlocked right now. Please try again.");
      });
  }, [user, load]);

  async function chooseFile(f?: File | null) {
    setFormError("");
    if (!f) return;
    setFileName(f.name);
    setDraft(emptyDraft());
    setExtractNote("");
    setShowForm(true);

    // PDFs (and any non-image) aren't rasterized yet — open the manual form.
    if (!EXTRACTABLE_IMAGE_TYPES.includes(f.type)) {
      setExtractNote(
        "Auto-extraction reads JPG, PNG, or WebP photos — you can fill this PDF in manually.",
      );
      return;
    }

    setExtracting(true);
    try {
      const imageBase64 = await readAsBase64(f);
      const extracted = await extractBillFromImage({ data: { imageBase64, mimeType: f.type } });
      setDraft(draftFromExtraction(extracted));
      setExtractNote(
        "Fields auto-extracted from your bill — review and edit anything before confirming.",
      );
    } catch (error) {
      // Degrade gracefully: keep the empty editable form, never break upload.
      setDraft(emptyDraft());
      const msg = messageFromError(error, "");
      const unavailable =
        /OPENAI_API_KEY|Extraction isn't enabled|could not be read as structured data|Unsupported image/i.test(
          msg,
        );
      setExtractNote(
        unavailable
          ? "Auto-extraction unavailable — you can fill this in manually."
          : "Auto-extraction couldn't read this bill — you can fill this in manually.",
      );
    } finally {
      setExtracting(false);
    }
  }

  /** Try a sample bill — fills the editable Confirm form with realistic data. */
  function loadSample() {
    setFormError("");
    setExtractNote("");
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 10);
    const stmt = new Date(today);
    stmt.setDate(stmt.getDate() - 5);
    const period = `${String(stmt.getMonth() + 1).padStart(2, "0")}/${stmt.getFullYear()}`;
    setDraft({
      vendor: "Lumbee River EMC",
      category: "Utilities",
      account_reference: "000004821",
      statement_date: stmt.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      amount_due: "134.28",
      minimum_payment: "",
      billing_period: period,
      autopay_status: "Detected",
    });
    setShowForm(true);
    setNotice(
      "Sample bill loaded. These are extracted values — edit anything before confirming.",
    );
  }

  function setD(field: keyof BillDraft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function confirmBill() {
    if (!draft.vendor.trim()) {
      setFormError("Vendor is required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await createBill({
        data: {
          vendor: draft.vendor,
          category: draft.category,
          account_reference: draft.account_reference,
          statement_date: draft.statement_date,
          due_date: draft.due_date,
          amount_due: draft.amount_due,
          minimum_payment: draft.minimum_payment,
          billing_period: draft.billing_period,
          autopay_status: draft.autopay_status,
          confidence_score: draft.autopay_status === "Unknown" ? 0.5 : 0.97,
        },
      });
      setShowForm(false);
      setFileName(null);
      setDraft(emptyDraft());
      setExtractNote("");
      setExtracting(false);
      setNotice("Bill confirmed and added to your tracker.");
      await load();
    } catch (error) {
      setFormError(messageFromError(error, "The bill could not be saved. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function seedDemo() {
    setSeeding(true);
    setFormError("");
    try {
      await seedDemoSeries({ data: { ok: true } });
      setNotice("Demo series loaded — open the Lumbee River EMC bill to see change detection.");
      await load();
    } catch (error) {
      setNotice(messageFromError(error, "The demo series could not be loaded."));
    } finally {
      setSeeding(false);
    }
  }

  if (!isLoaded) {
    return <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading bills" />;
  }
  if (!user) return <SignInRequired />;
  if (entitled === null) {
    return <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading bills" />;
  }
  if (!entitled) {
    return <AddonLocked />;
  }

  const filtered = filter === "All" ? bills : bills.filter((b) => b.status === filter);
  const countLabel = `${filtered.length} ${filtered.length === 1 ? "bill" : "bills"}${filter === "All" ? "" : ` (${filter})`}`;

  return (
    <div className="mt-8 space-y-8">
      <Notice>{notice}</Notice>

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load()} />}
      {status === "ready" && !configured && (
        <ErrorCard message="Storage isn't connected yet — bills can't be loaded or saved right now." onRetry={() => void load()} />
      )}

      {/* Capture */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Capture a bill</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a photo or PDF, or try the built-in sample — BillSnap extracts
          the vendor, amount due, due date, and more (all editable).
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void chooseFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-5 text-center transition hover:border-indigo-500/60"
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800 text-xl text-gray-300">↑</div>
          <p className="mt-3 text-sm font-medium text-gray-200">
            {fileName ? `Selected: ${fileName}` : "Drop a bill image or PDF here"}
          </p>
          <p className="mt-1 text-xs text-gray-500">or click to browse · JPG, PNG, WebP, or PDF</p>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadSample}
            className="flex-1 rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-600/20"
          >
            Try a sample bill (demo)
          </button>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void seedDemo()}
            className="flex-1 rounded-full border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white disabled:opacity-45"
          >
            {seeding ? "Loading demo series…" : "Load demo series (change detection)"}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-gray-600">
          Demo data is labeled as such and only ever stored on your own account.
        </p>
      </section>

      {/* Confirm (Identify → Extract → Confirm) */}
      {showForm && (
        <section className="rounded-2xl border border-indigo-900/50 bg-gray-900/60 p-5 sm:p-6">
          <h2 className="font-semibold">Review &amp; confirm</h2>
          <p className="mt-1 text-sm text-gray-500">
            These are the extracted fields. Edit anything before confirming.
          </p>
          {extracting && (
            <p role="status" className="mt-3 rounded-xl border border-indigo-900/60 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
              Reading your bill and extracting fields… this can take a moment.
            </p>
          )}
          {!extracting && extractNote && (
            <p role="status" className="mt-3 rounded-xl border border-indigo-900/60 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
              {extractNote}
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-400">Vendor *</span>
              <input type="text" value={draft.vendor} onChange={(e) => setD("vendor", e.target.value)} placeholder="e.g. Lumbee River EMC" className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Category</span>
              <select value={draft.category} onChange={(e) => setD("category", e.target.value)} className={inputCls()}>
                <option value="">—</option>
                {BILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Account reference</span>
              <input type="text" value={draft.account_reference} onChange={(e) => setD("account_reference", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Statement date</span>
              <input type="text" value={draft.statement_date} onChange={(e) => setD("statement_date", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Due date</span>
              <input type="text" value={draft.due_date} onChange={(e) => setD("due_date", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Amount due</span>
              <input type="number" step="0.01" value={draft.amount_due} onChange={(e) => setD("amount_due", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Minimum payment</span>
              <input type="number" step="0.01" value={draft.minimum_payment} onChange={(e) => setD("minimum_payment", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Billing period</span>
              <input type="text" value={draft.billing_period} onChange={(e) => setD("billing_period", e.target.value)} className={inputCls()} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400">Autopay status</span>
              <select value={draft.autopay_status} onChange={(e) => setD("autopay_status", e.target.value)} className={inputCls()}>
                <option>Detected</option>
                <option>Not Detected</option>
                <option>Unknown</option>
              </select>
            </label>
          </div>
          {formError && <p role="alert" className="mt-3 text-sm text-red-400">{formError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError("");
                setFileName(null);
                setDraft(emptyDraft());
                setExtractNote("");
                setExtracting(false);
              }}
              className="rounded-full border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmBill()}
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-45"
            >
              {busy ? "Saving…" : "Confirm & add bill"}
            </button>
          </div>
        </section>
      )}

      {/* Track */}
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Your bills</h2>
            <p className="mt-1 text-sm text-gray-500">{countLabel}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(["All", ...BILL_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === s
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-700 text-gray-300 hover:border-indigo-500"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {status === "loading" ? (
            <div className="space-y-3" aria-label="Loading bills">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              Bills are unavailable right now. Check the message above and try again.
            </div>
          ) : filtered.length ? (
            <div className="space-y-3">
              {filtered.map((bill) => (
                <BillRow key={bill.id} bill={bill} onOpen={(b) => setSelected(b)} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              {!configured
                ? "Bills will appear here once storage is connected."
                : filter === "All"
                  ? "No bills yet. Capture your first bill above, or load the demo series to explore."
                  : `No ${filter.toLowerCase()} bills right now.`}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <BillDetailModal
          bill={selected}
          all={bills}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
