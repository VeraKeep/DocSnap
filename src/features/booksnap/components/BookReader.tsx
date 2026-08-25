import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAnnotation,
  deleteAnnotation,
  getBookPages,
  ingestBookPages,
  listAnnotations,
} from "../server";
import type { BookAnnotation, BookPage, BookRow } from "../types";
import { BookAnnotations } from "./BookAnnotations";

/**
 * BookReader — page-aware read & annotate.
 *
 * Shows a book's stored, immutable pages (`book_pages`) one at a time, with
 * Prev/Next navigation. The user can select text on a page to create a
 * highlight or note that is anchored to that exact page (page_id) and
 * paragraph (paragraph_index) — every annotation traces back to a concrete
 * edition + page + paragraph, and quotes are never fabricated.
 *
 * If the book has no stored pages yet (e.g. a Stage-1 book that only stored
 * flat text), the reader offers an "Extract pages" upload that runs the
 * per-page extractor (pdfExtract.ts) and persists pages via ingestBookPages.
 * When storage isn't connected, extracted pages are held in memory so the book
 * can still be read in the current session.
 */
const HIGHLIGHT_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  amber: { label: "Amber", bg: "rgba(251,191,36,0.32)", border: "rgba(251,191,36,0.9)" },
  indigo: { label: "Indigo", bg: "rgba(129,140,248,0.32)", border: "rgba(129,140,248,0.9)" },
  pink: { label: "Pink", bg: "rgba(244,114,182,0.32)", border: "rgba(244,114,182,0.9)" },
  emerald: { label: "Green", bg: "rgba(52,211,153,0.32)", border: "rgba(52,211,153,0.9)" },
};
const DEFAULT_COLOR = "amber";

export function BookReader({ book, onBack }: { book: BookRow; onBack: () => void }) {
  const bookId = book.id;

  const [configured, setConfigured] = useState(true);
  const [remotePages, setRemotePages] = useState<BookPage[]>([]);
  const [localPages, setLocalPages] = useState<BookPage[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageError, setPageError] = useState("");

  const [annotations, setAnnotations] = useState<BookAnnotation[]>([]);
  const [annStatus, setAnnStatus] = useState<"loading" | "ready" | "error">("loading");
  const [annError, setAnnError] = useState("");

  // Selection toolbar state
  const [selection, setSelection] = useState<{
    quote: string;
    paragraphIndex: number | null;
  } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [activeColor, setActiveColor] = useState(DEFAULT_COLOR);
  const [annBusy, setAnnBusy] = useState(false);
  const [annMessage, setAnnMessage] = useState("");

  // Ingest state
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState("");
  const ingestInputRef = useRef<HTMLInputElement>(null);

  // The page list to display: server-backed when connected, else this-session
  // extraction (so a book is still readable when storage isn't connected).
  const sourceList: BookPage[] = configured ? remotePages : localPages.length ? localPages : remotePages;

  const activePage = useMemo(
    () => sourceList.find((p) => p.pageNumber === currentPageNumber) ?? null,
    [sourceList, currentPageNumber],
  );
  const hasPages = (configured && remotePages.length > 0) || localPages.length > 0;

  const paragraphs = useMemo(
    () => (activePage ? activePage.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : []),
    [activePage],
  );

  const loadPages = useCallback(async (pageNumber: number) => {
    setPageStatus("loading");
    setPageError("");
    try {
      const result = await getBookPages({ data: { bookId, page: pageNumber } });
      setConfigured(result.configured);
      setTotal(result.total);
      setRemotePages(result.pages);
      if (!result.configured && localPages.length) {
        // session-local pages are the source of truth when storage is off
      }
      setPageStatus("ready");
    } catch (error) {
      setPageStatus("error");
      setPageError(error instanceof Error && error.message.trim() ? error.message : "This page couldn't be loaded.");
    }
  }, [bookId, localPages.length]);

  const loadAnnotations = useCallback(async () => {
    setAnnStatus("loading");
    setAnnError("");
    try {
      const result = await listAnnotations({ data: { bookId } });
      setAnnotations(result.annotations as BookAnnotation[]);
      setAnnStatus("ready");
    } catch (error) {
      setAnnStatus("error");
      setAnnError(error instanceof Error && error.message.trim() ? error.message : "Your annotations couldn't be loaded.");
    }
  }, [bookId]);

  useEffect(() => {
    void loadPages(currentPageNumber);
    void loadAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  function goTo(next: number) {
    if (next < 1 || (configured && total > 0 && next > total)) return;
    setCurrentPageNumber(next);
    void loadPages(next);
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }
    const quote = sel.toString().trim().slice(0, 10_000);
    if (!quote) {
      setSelection(null);
      return;
    }
    let paragraphIndex: number | null = null;
    const node: Node | null = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE && node.parentElement) {
      const el = node.parentElement.closest("[data-para]");
      if (el) paragraphIndex = Number(el.getAttribute("data-para"));
    } else if (node && node.nodeType === Node.ELEMENT_NODE) {
      const el = (node as Element).closest("[data-para]");
      if (el) paragraphIndex = Number(el.getAttribute("data-para"));
    }
    setSelection({ quote, paragraphIndex });
    setNoteOpen(false);
    setNoteText("");
  }

  async function saveAnnotation(withNote: boolean) {
    if (!selection || !activePage) return;
    const note = withNote ? noteText.trim() : null;
    const local: BookAnnotation = {
      id: Date.now(),
      bookId,
      pageId: activePage.id,
      pageNumber: activePage.pageNumber,
      paragraphIndex: selection.paragraphIndex,
      quote: selection.quote,
      note,
      color: activeColor,
      createdAt: new Date().toISOString(),
    };
    setAnnBusy(true);
    setAnnMessage("");
    try {
      if (!configured) {
        // Storage not connected: keep the highlight in the current session only.
        setAnnotations((a) => [local, ...a]);
        setAnnMessage("Highlight added for this session (storage isn't connected here).");
      } else {
        const result = await createAnnotation({
          data: {
            bookId,
            pageId: activePage.id,
            paragraphIndex: selection.paragraphIndex,
            quote: selection.quote,
            note,
            color: activeColor,
          },
        });
        if (result.annotation) {
          setAnnotations((a) => [result.annotation as BookAnnotation, ...a]);
          setAnnMessage("Highlight added — p." + (result.annotation.pageNumber ?? activePage.pageNumber));
        } else {
          setAnnotations((a) => [local, ...a]);
          setAnnMessage("Highlight added.");
        }
      }
      setSelection(null);
      setNoteOpen(false);
      setNoteText("");
    } catch (error) {
      setAnnMessage(error instanceof Error && error.message.trim() ? error.message : "That highlight couldn't be saved.");
    } finally {
      setAnnBusy(false);
    }
  }

  async function removeAnnotation(id: number) {
    try {
      await deleteAnnotation({ data: { id, bookId } });
      setAnnotations((a) => a.filter((x) => x.id !== id));
    } catch (error) {
      setAnnMessage(error instanceof Error && error.message.trim() ? error.message : "That annotation couldn't be deleted.");
    }
  }

  async function onIngestFile(f?: File | null) {
    setIngestMessage("");
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      setIngestMessage("Please choose a PDF book file.");
      return;
    }
    setIngestBusy(true);
    try {
      const { extractBookPages } = await import("~/features/booksnap/pdfExtract");
      const extracted = await extractBookPages(f);
      if (!extracted.length) {
        setIngestMessage("No readable pages could be extracted from this PDF.");
        return;
      }
      const result = await ingestBookPages({
        data: { bookId, pages: extracted.map((p) => ({ pageNumber: p.pageNumber, text: p.text })) },
      });
      setConfigured(result.configured);
      const localIds = extracted.map(
        (p, i): BookPage => ({ id: -(i + 1), bookId, pageNumber: p.pageNumber, text: p.text }),
      );
      if (result.configured) {
        await loadPages(1);
        setAnnMessage(`${result.count} pages stored for this book.`);
      } else {
        // Session-only: hold pages in memory so the book is still readable now.
        setLocalPages(localIds);
        setRemotePages([]);
        setCurrentPageNumber(1);
        setAnnMessage(`${result.count} pages extracted for this session (storage isn't connected — pages won't persist).`);
      }
      setPageStatus("ready");
    } catch (error) {
      setIngestMessage(error instanceof Error && error.message.trim() ? error.message : "That PDF could not be read.");
    } finally {
      setIngestBusy(false);
    }
  }

  // Highlight rendering helper for a paragraph: wrap any stored quote in a mark
  // (never fabricated) so existing highlights show up visually on the page.
  function renderParagraph(text: string, paraIndex: number) {
    const pageAnns = annotations.filter(
      (a) => a.pageId === activePage?.id && a.paragraphIndex === paraIndex,
    );
    if (!pageAnns.length) return <>{text}</>;
    let pieces: (string | JSX.Element)[] = [text];
    for (const ann of pageAnns) {
      const escaped = (ann.quote || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      if (!escaped) continue;
      const re = new RegExp(`(${escaped})`, "i");
      pieces = pieces.flatMap((piece) => {
        if (typeof piece !== "string") return [piece];
        const color = HIGHLIGHT_COLORS[ann.color] ?? HIGHLIGHT_COLORS[DEFAULT_COLOR];
        return piece.split(re).map((part, pj) =>
          re.test(part) ? (
            <mark
              key={pj}
              style={{ backgroundColor: color.bg, borderRadius: 2, color: "inherit" }}
            >
              {part}
            </mark>
          ) : (
            part
          ),
        );
      });
    }
    return <>{pieces}</>;
  }
  function jumpToPage(pageNumber: number) {
    setCurrentPageNumber(pageNumber);
    void loadPages(pageNumber);
  }

  if (pageStatus === "loading" && !hasPages) {
    return <div className="mt-6 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-gray-500 transition hover:text-indigo-400"
          >
            ← Back to bookshelf
          </button>
          <h2 className="mt-1 text-xl font-semibold">{book.title}</h2>
          {book.author && <p className="text-sm text-gray-500">by {book.author}</p>}
        </div>
        {hasPages && (
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              disabled={currentPageNumber <= 1}
              onClick={() => goTo(currentPageNumber - 1)}
              className="rounded-full border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="px-2 text-xs text-gray-400">
              Page {activePage?.pageNumber ?? currentPageNumber}
              {configured && total > 0 ? ` of ${total}` : ""}
            </span>
            <button
              type="button"
              disabled={configured && total > 0 && currentPageNumber >= total}
              onClick={() => goTo(currentPageNumber + 1)}
              className="rounded-full border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {annMessage && (
        <div role="status" className="rounded-2xl border border-indigo-900/60 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
          {annMessage}
        </div>
      )}
      {pageStatus === "error" && (
        <div role="alert" className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          {pageError}
        </div>
      )}
      {annStatus === "error" && (
        <div role="alert" className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          {annError}
        </div>
      )}

      {/* No pages stored yet: offer extraction */}
      {!hasPages && (
        <div className="rounded-2xl border border-dashed border-gray-700 p-8 text-center">
          <div className="text-3xl">📄</div>
          <h3 className="mt-3 font-semibold">This book has no readable pages yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Upload this book's PDF to extract its pages. Page text is stored as immutable anchors so
            highlights and notes trace back to a concrete edition + page + paragraph.
          </p>
          <input
            ref={ingestInputRef}
            className="hidden"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => void onIngestFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={ingestBusy}
            onClick={() => ingestInputRef.current?.click()}
            className="mt-5 inline-flex rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-45"
          >
            {ingestBusy ? "Extracting pages…" : "Upload PDF to read"}
          </button>
          {ingestMessage && (
            <p role="status" className="mt-3 text-sm text-amber-200">{ingestMessage}</p>
          )}
        </div>
      )}

      {/* Selection toolbar */}
      {hasPages && selection && (
        <div className="rounded-2xl border border-indigo-800/60 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Selected from p.{activePage?.pageNumber}</p>
          <p className="mt-1 text-sm italic text-gray-300">“{selection.quote}”</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Color:</span>
            {Object.entries(HIGHLIGHT_COLORS).map(([key, c]) => (
              <button
                key={key}
                type="button"
                title={c.label}
                onClick={() => setActiveColor(key)}
                className={`h-5 w-5 rounded-full transition ${activeColor === key ? "ring-2 ring-offset-2 ring-offset-gray-900 ring-white/70" : ""}`}
                style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
              />
            ))}
            <button
              type="button"
              disabled={annBusy}
              onClick={() => void saveAnnotation(false)}
              className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-gray-950 transition hover:bg-amber-400 disabled:opacity-45"
            >
              {annBusy ? "Saving…" : "Highlight"}
            </button>
            <button
              type="button"
              disabled={annBusy}
              onClick={() => setNoteOpen((v) => !v)}
              className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-45"
            >
              Add note
            </button>
          </div>
          {noteOpen && (
            <div className="mt-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Your note for this passage…"
                rows={2}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={annBusy}
                onClick={() => void saveAnnotation(true)}
                className="mt-2 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-45"
              >
                Save note
              </button>
            </div>
          )}
        </div>
      )}

      {/* Page text */}
      {hasPages && activePage && (
        <div
          onMouseUp={handleSelection}
          className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-7"
        >
          <p className="mb-4 text-[11px] font-medium uppercase tracking-wide text-indigo-400">
            Page {activePage.pageNumber}
          </p>
          <div className="max-w-none space-y-4 text-[15px] leading-relaxed text-gray-200">
            {paragraphs.map((para, i) => (
              <p key={i} data-para={i}>
                {renderParagraph(para, i)}
              </p>
            ))}
          </div>
          {!paragraphs.length && (
            <p className="text-sm text-gray-500">
              This page has no readable text{!configured ? " (storage isn't connected here)" : ""}.
            </p>
          )}
        </div>
      )}

      {/* Annotations */}
      <BookAnnotations
        annotations={annotations}
        onDelete={(id) => void removeAnnotation(id)}
        onJumpToPage={(page) => jumpToPage(page)}
        currentPageNumber={activePage?.pageNumber}
      />
    </div>
  );
}
