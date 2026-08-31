import { useCallback, useEffect, useRef, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import { uploadPDFBlob } from "~/cloudSync";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";
import { createBook, deleteBook, getBooksEntitlement, listBooks } from "../server";
import { type BookPage, type BookPageInput, type BookRow } from "../types";
import { BookReader } from "./BookReader";
import { BookSearch } from "./BookSearch";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">📚</div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to build your bookshelf</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        Your books are private to your DocSnap account. After signing in you can add books and keep
        every edition, page, and quote on record.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in
        </button>
      </SignInButton>
      <p className="mt-4 text-xs text-gray-600">Your bookshelf can't be accessed without signing in.</p>
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

/**
 * Locked/upgrade screen — shown to a signed-in user WITHOUT the BookSnap
 * add-on. BookSnap is a paid add-on sold on the DocSnap side ($3.99/month or
 * $39.99/year) and is NOT bundled into any DocSnap tier, so even a paid
 * (Personal/Family) subscriber sees this until they own the add-on (or hold
 * VeraKeep All Access, which sets addon_booksnap). The Buy buttons link to the
 * live recurring Stripe checkouts from moduleCheckout.ts.
 */
function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20">📚</div>
      <h2 className="mt-5 text-xl font-semibold">BookSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        BookSnap isn't included in DocSnap plans — it's a separate add-on
        ($3.99/month or $39.99/year). Purchase it to keep every book, edition,
        page, and quote on your shelf and searchable.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <a
          href={MODULE_CHECKOUT_URLS.BOOKSNAP_MONTHLY}
          className="inline-flex justify-center rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Add BookSnap — $3.99/mo
        </a>
        <a
          href={MODULE_CHECKOUT_URLS.BOOKSNAP_ANNUAL}
          className="inline-flex justify-center rounded-full border border-gray-700 px-6 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
        >
          or $39.99/yr · two months free
        </a>
      </div>
      <p className="mt-4 text-xs text-gray-600">
        Your bookshelf stays private to your DocSnap account.
      </p>
    </div>
  );
}

const READING_STATUSES: { value: string; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "reading", label: "Currently reading" },
  { value: "finished", label: "Finished" },
];

const EMPTY_FORM = {
  title: "",
  author: "",
  isbn: "",
  edition: "",
  publisher: "",
  year: "",
  readingStatus: "unread",
  collection: "",
  tags: "",
};

export function BookLibrary() {
  const { user, isLoaded } = useUser();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [openBook, setOpenBook] = useState<BookRow | null>(null);
  const [openPage, setOpenPage] = useState(1);

  // Open a book at a specific page (used by search results + the Read button).
  function openAt(book: BookRow, page: number) {
    setOpenPage(page >= 1 ? page : 1);
    setOpenBook(book);
  }

  // Add-a-book form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pages extracted at add-time, held for session-only mode (storage off) so a
  // just-added PDF is readable in the reader without re-uploading the same file.
  const [sessionPages, setSessionPages] = useState<Record<number, BookPage[]>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listBooks();
      setConfigured(result.configured);
      setBooks(result.books as BookRow[]);
      setStatus("ready");
      setLoadError("");
    } catch (error) {
      setStatus("error");
      setLoadError(messageFromError(error, "Your bookshelf could not be loaded. Please try again."));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getBooksEntitlement()
      .then((result) => {
        const has = result.configured && result.hasAddon;
        setEntitled(has);
        if (has) void load();
      })
      .catch(() => {
        setEntitled(false);
        setStatus("error");
        setLoadError("BookSnap couldn't be unlocked right now. Please try again.");
      });
  }, [user, load]);

  function setField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function chooseFile(f?: File | null) {
    setFormError("");
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      setFormError("Please choose a PDF book file.");
      return;
    }
    setFile(f);
  }

  async function submitBook() {
    if (!form.title.trim()) {
      setFormError("Add a book title first.");
      return;
    }
    setBusy(true);
    setFormError("");
    setSaved("");
    try {
      let sourceText = "";
      let originalFileRef: string | null = null;
      let pageCount: number | null = null;
      let pages: BookPageInput[] = [];
      if (file) {
        // Client-side per-page extraction (no secrets needed) via pdfExtract.ts,
        // which preserves page boundaries (+ OCR fallback for scanned books).
        // The pages are both stored as immutable `book_pages` anchors (so the
        // book opens instantly in the reader) and collapsed into `source_text`
        // (the flat searchable anchor source).
        const { extractBookPages } = await import("~/features/booksnap/pdfExtract");
        const extracted = await extractBookPages(file);
        pages = extracted.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
        sourceText = extracted.map((p) => p.text.trim()).filter(Boolean).join("\n\n");
        pageCount = extracted.length || null;
        // Best-effort: try to store a hosted URL for the user's own file; if the
        // upload isn't configured, fall back to the file name (a name only — never
        // a redistributable copy is persisted beyond the user's licensed original).
        const uploaded = await uploadPDFBlob(file, file.name).catch(() => null);
        originalFileRef = uploaded?.fileUrl ?? file.name;
      }
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const result = await createBook({
        data: {
          title: form.title.trim(),
          author: form.author.trim() || null,
          isbn: form.isbn.trim() || null,
          edition: form.edition.trim() || null,
          publisher: form.publisher.trim() || null,
          year: form.year.trim() || null,
          readingStatus: form.readingStatus,
          collection: form.collection.trim() || null,
          tags,
          originalFileRef,
          sourceText,
          pages,
          pageCount,
        },
      });
      setConfigured(result.configured);
      setFile(null);
      setForm(EMPTY_FORM);
      if (result.configured && result.book) {
        setSaved(
          result.book.sourceText || (result.book.page_count ?? 0) > 0
            ? "Book added to your bookshelf with its extracted text on record — open it to read."
            : "Book added to your bookshelf. (No PDF text was stored.)",
        );
      } else {
        setSaved(
          pages.length
            ? "Book added for this session (storage isn't connected here) — it's readable now but won't persist."
            : "Book added for this session (storage isn't connected here).",
        );
      }
      await load();
      if (!result.configured && result.book) {
        // Keep the session-only book on the shelf so it can be opened/read now,
        // and remember its extracted pages so the reader needs no re-upload.
        const bookId = result.book.id;
        const localPages: BookPage[] = pages.map(
          (p, i): BookPage => ({ id: -(i + 1), bookId, pageNumber: p.pageNumber, text: p.text }),
        );
        setSessionPages((prev) => ({ ...prev, [bookId]: localPages }));
        setBooks((prev) => {
          const bs = prev.filter((b) => b.id !== bookId);
          return [result.book! as BookRow, ...bs];
        });
      }
    } catch (error) {
      setFormError(
        messageFromError(
          error,
          "The book could not be saved. If you attached a PDF, try one with readable text, or add the book without a file.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeBook(id: number) {
    try {
      await deleteBook({ data: { id } });
      await load();
    } catch (error) {
      setNotice(messageFromError(error, "That book could not be deleted."));
    }
  }

  if (!isLoaded) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading bookshelf" />
    );
  }
  if (!user) return <SignInRequired />;
  if (entitled === false) return <AddonLocked />;

  const countLabel = `${books.length} ${books.length === 1 ? "book" : "books"}`;
  const readingCount = books.filter((b) => b.reading_status === "reading").length;
  const finishedCount = books.filter((b) => b.reading_status === "finished").length;

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
  const labelCls = "block text-xs font-medium text-gray-500";

  if (openBook) {
    return (
      <div className="mt-8">
        <BookReader
          book={openBook}
          onBack={() => setOpenBook(null)}
          initialPage={openPage}
          initialLocalPages={!configured ? sessionPages[openBook.id] : undefined}
        />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <Notice>{notice}</Notice>

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load()} />}
      {status === "ready" && !configured && (
        <ErrorCard
          message="Storage isn't connected yet — your bookshelf can't be loaded or saved right now, but you can still add a book for this session."
          onRetry={() => void load()}
        />
      )}

      {/* Add a book */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <h2 className="font-semibold">Add a book</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter the book's metadata, and optionally attach a PDF so its text is stored as a
          searchable source on your record.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>Title *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="The Name of the Rose"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Author</span>
            <input
              type="text"
              value={form.author}
              onChange={(e) => setField("author", e.target.value)}
              placeholder="Umberto Eco"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>ISBN</span>
            <input
              type="text"
              value={form.isbn}
              onChange={(e) => setField("isbn", e.target.value)}
              placeholder="978-0-15-144647-6"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Edition</span>
            <input
              type="text"
              value={form.edition}
              onChange={(e) => setField("edition", e.target.value)}
              placeholder="1st edition"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Publisher</span>
            <input
              type="text"
              value={form.publisher}
              onChange={(e) => setField("publisher", e.target.value)}
              placeholder="Harcourt"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Year</span>
            <input
              type="text"
              value={form.year}
              onChange={(e) => setField("year", e.target.value)}
              placeholder="1980"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Reading status</span>
            <select
              value={form.readingStatus}
              onChange={(e) => setField("readingStatus", e.target.value)}
              className={`${inputCls} mt-1`}
            >
              {READING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Collection</span>
            <input
              type="text"
              value={form.collection}
              onChange={(e) => setField("collection", e.target.value)}
              placeholder="Fiction, Reference…"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Tags (comma-separated)</span>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setField("tags", e.target.value)}
              placeholder="medieval, mystery"
              className={`${inputCls} mt-1`}
            />
          </label>
        </div>

        {/* Optional PDF upload */}
        <div className="mt-4">
          <span className={labelCls}>Book file (optional — stores its text on your record)</span>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              chooseFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className="mt-1 cursor-pointer rounded-2xl border-2 border-dashed border-gray-700 p-5 text-center transition hover:border-indigo-500/60"
          >
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
            {file ? (
              <p className="text-sm font-medium text-indigo-300">{file.name} ready</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-200">Attach a book PDF (optional)</p>
                <p className="mt-1 text-xs text-gray-500">or click to browse · PDF best-effort (text-based)</p>
              </>
            )}
            {file && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="mt-2 text-xs text-gray-500 transition hover:text-gray-300"
              >
                Remove file
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submitBook()}
          className="mt-5 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Adding your book…" : "Add to bookshelf"}
        </button>
        {formError && (
          <p role="alert" className="mt-3 text-center text-sm text-red-400">
            {formError}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3 text-center text-sm text-indigo-300">
            {saved}
          </p>
        )}
      </section>

      {/* Search your books (Stage 3) */}
      <BookSearch onOpenBook={(book, page) => openAt(book, page)} />

      {/* Bookshelf */}
      <section>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold">Your bookshelf</h2>
            <p className="mt-1 text-sm text-gray-500">{countLabel}</p>
            {(readingCount > 0 || finishedCount > 0) && (
              <p className="mt-1 text-xs text-gray-500">
                {readingCount > 0 && <span className="text-amber-300">📖 {readingCount} reading</span>}
                {readingCount > 0 && finishedCount > 0 && <span> · </span>}
                {finishedCount > 0 && <span className="text-emerald-300">✓ {finishedCount} finished</span>}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {status === "loading" ? (
            <div className="space-y-3" aria-label="Loading bookshelf">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              Books are unavailable right now. Check the message above and try again.
            </div>
          ) : books.length ? (
            books.map((b) => (
              <div
                key={b.id}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-left transition hover:border-gray-700"
              >
                <button
                  type="button"
                  onClick={() => openAt(b, 1)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="font-medium text-gray-200 transition hover:text-indigo-300">{b.title}</span>
                  {b.author && <span className="ml-2 text-sm text-gray-500">by {b.author}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    {b.year && <span>{b.year}</span>}
                    {b.publisher && <span>{b.publisher}</span>}
                    {b.collection && <span>· {b.collection}</span>}
                    {b.tags.map((t) => (
                      <span key={t} className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                        {t}
                      </span>
                    ))}
                  </span>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openAt(b, 1)}
                    className="rounded-full border border-indigo-700 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-900/40"
                  >
                    Read
                  </button>
                  <span
                    className={
                      b.reading_status === "finished"
                        ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                        : b.reading_status === "reading"
                          ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                          : "rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-400"
                    }
                  >
                    {b.reading_status === "finished"
                      ? "Finished"
                      : b.reading_status === "reading"
                        ? "Reading"
                        : "Unread"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeBook(b.id)}
                    className="text-xs text-gray-500 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-800 p-10 text-center text-sm text-gray-500">
              Your books will appear here. Add your first book above to start turning books into
              searchable memory.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
