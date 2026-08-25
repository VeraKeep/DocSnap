import type { BookAnnotation } from "../types";

/**
 * BookAnnotations — a user's highlights & notes for one book.
 *
 * Each annotation carries immutable provenance: book_id + page_id (+ derived
 * page_number) + paragraph_index, so every entry traces back to a concrete
 * edition + page + paragraph. Quotes are stored verbatim from the book's
 * extracted text — nothing is fabricated.
 */
const HIGHLIGHT_COLORS: Record<string, { label: string; bg: string; border: string }> = {
  amber: { label: "Amber", bg: "rgba(251,191,36,0.32)", border: "rgba(251,191,36,0.9)" },
  indigo: { label: "Indigo", bg: "rgba(129,140,248,0.32)", border: "rgba(129,140,248,0.9)" },
  pink: { label: "Pink", bg: "rgba(244,114,182,0.32)", border: "rgba(244,114,182,0.9)" },
  emerald: { label: "Green", bg: "rgba(52,211,153,0.32)", border: "rgba(52,211,153,0.9)" },
};
const DEFAULT_COLOR = "amber";

export function BookAnnotations({
  annotations,
  onDelete,
  onJumpToPage,
  currentPageNumber,
}: {
  annotations: BookAnnotation[];
  onDelete: (id: number) => void;
  onJumpToPage?: (page: number) => void;
  currentPageNumber?: number;
}) {
  return (
    <section>
      <h3 className="font-semibold">
        Your highlights &amp; notes{" "}
        <span className="text-sm font-normal text-gray-500">
          {annotations.length} {annotations.length === 1 ? "item" : "items"}
        </span>
      </h3>
      {annotations.length ? (
        <ul className="mt-3 space-y-2">
          {annotations.map((a) => {
            const c = HIGHLIGHT_COLORS[a.color] ?? HIGHLIGHT_COLORS[DEFAULT_COLOR];
            const pageKnown = a.pageNumber != null;
            const canJump = onJumpToPage && pageKnown && currentPageNumber != null && a.pageNumber !== currentPageNumber;
            return (
              <li key={a.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                    />
                    {pageKnown ? `p.${a.pageNumber}` : "Page unknown"}
                    {a.paragraphIndex != null ? ` · ¶ ${a.paragraphIndex + 1}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(a.id)}
                    className="text-xs text-gray-500 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
                {a.quote && <p className="mt-2 text-sm italic text-gray-300">“{a.quote}”</p>}
                {a.note && (
                  <p className="mt-1.5 rounded-lg bg-gray-950/60 px-3 py-2 text-sm text-gray-300">
                    💬 {a.note}
                  </p>
                )}
                {canJump && (
                  <button
                    type="button"
                    onClick={() => onJumpToPage(a.pageNumber as number)}
                    className="mt-2 text-xs text-indigo-400 transition hover:text-indigo-300"
                  >
                    Jump to page {a.pageNumber} →
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          No highlights or notes yet. Select text on a page to highlight it or add a note.
        </p>
      )}
    </section>
  );
}
