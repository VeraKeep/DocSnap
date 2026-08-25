import { useCallback, useState } from "react";
import { searchBooks } from "../server";
import type { BookRow, BookSearchResult } from "../types";

/**
 * BookSearch — full-text keyword search across the user's own library.
 *
 * Results are page-attributed cards ("Title · p.N" + a verbatim snippet + a
 * paragraph reference where available). Every result traces back to a concrete
 * book + edition + page (+ paragraph) the user owns — snippets come verbatim
 * from the user's stored page text and are never fabricated. Clicking a result
 * opens the BookReader at that exact page.
 */
function matchLabel(matchedOn: BookSearchResult["matchedOn"]): string {
  switch (matchedOn) {
    case "title":
      return "matches the book title";
    case "author":
      return "matches the author";
    case "metadata":
      return "matches the book's record";
    default:
      return "in the text";
  }
}

export function BookSearch({ onOpenBook }: { onOpenBook: (book: BookRow, page: number) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [noTerms, setNoTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setNoTerms(false);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await searchBooks({ data: { query: q } });
      setResults(result.results as BookSearchResult[]);
      setNoTerms(result.noTerms);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "That search couldn't be run.");
      setResults([]);
      setSearched(false);
      setNoTerms(false);
    } finally {
      setBusy(false);
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(query);
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      <h2 className="font-semibold">Search your books</h2>
      <p className="mt-1 text-sm text-gray-500">
        Find ideas across your whole library. Every result points to the exact book, page, and
        paragraph it came from — nothing is fabricated.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. quantum entanglement, or a book title…"
          aria-label="Search your books"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="shrink-0 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {searched && noTerms && (
        <p className="mt-4 text-sm text-gray-400">
          Try a more specific search — that query didn't have enough to search on.
        </p>
      )}

      {searched && !noTerms && (
        <div className="mt-4">
          <p className="text-xs text-gray-500">
            {results.length} {results.length === 1 ? "result" : "results"}
          </p>
          {results.length ? (
            <ul className="mt-3 space-y-2">
              {results.map((r) => (
                <li key={`${r.bookId}-${r.pageId}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenBook(
                        {
                          id: r.bookId,
                          isbn: null,
                          title: r.bookTitle,
                          author: r.author,
                          edition: r.edition,
                          publisher: r.publisher,
                          year: r.year,
                          cover_url: null,
                          reading_status: "unread",
                          collection: null,
                          tags: [],
                          original_file_ref: null,
                          page_count: null,
                          analysis_status: "complete",
                          created_at: null,
                        } satisfies BookRow,
                        r.pageNumber ?? 1,
                      )
                    }
                    className="w-full rounded-2xl border border-gray-800 bg-gray-950/40 p-4 text-left transition hover:border-indigo-700"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-gray-200">{r.bookTitle}</span>
                      {r.pageNumber != null && (
                        <span className="text-sm text-indigo-400">· p.{r.pageNumber}</span>
                      )}
                      {r.paragraphIndex != null && (
                        <span className="text-xs text-gray-500">· ¶ {r.paragraphIndex + 1}</span>
                      )}
                      <span className="ml-auto text-[11px] text-gray-600">{matchLabel(r.matchedOn)}</span>
                    </span>
                    {r.author && <span className="mt-0.5 block text-xs text-gray-500">by {r.author}</span>}
                    {r.snippet && (
                      <span className="mt-2 block text-sm leading-relaxed text-gray-400">
                        “{r.snippet}”
                      </span>
                    )}
                    <span className="mt-2 block text-[11px] text-indigo-400">
                      {r.pageNumber != null ? `Open on p.${r.pageNumber} →` : "Open this book →"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No matches in your library. Try different keywords.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
