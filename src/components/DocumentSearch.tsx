import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  type CloudDocument,
  type DocCategory,
  getDocCategory,
  ALL_CATEGORIES,
} from "../cloudTypes";
import { getCategoryKeywords } from "../documentCategorizer";

// ── Types ──────────────────────────────────────────────────────────

export interface SearchResult {
  doc: CloudDocument;
  category: DocCategory;
  /** Score: higher is more relevant (match count + position bonus) */
  score: number;
  /** The first matching snippet (~50 chars around match) */
  snippet: string;
  /** Positions of matches within snippet for highlighting */
  matchIndices: Array<{ start: number; end: number }>;
}

interface ParsedQuery {
  /** Category filter extracted from query (null = search all categories) */
  category: DocCategory | null;
  /** Remaining search terms after stripping category keywords */
  searchTerms: string;
}

// ── Folder config (shared with MyScans) ─────────────────────────────

const BADGE_STYLES: Record<DocCategory, string> = {
  Receipts: "bg-emerald-900/60 text-emerald-400 border-emerald-700/60",
  Insurance: "bg-blue-900/60 text-blue-400 border-blue-700/60",
  Taxes: "bg-red-900/60 text-red-400 border-red-700/60",
  Medical: "bg-purple-900/60 text-purple-400 border-purple-700/60",
  School: "bg-orange-900/60 text-orange-400 border-orange-700/60",
  Military: "bg-lime-900/60 text-lime-400 border-lime-700/60",
  Manuals: "bg-gray-800 text-gray-300 border-gray-700",
  Uncategorized: "bg-gray-800/60 text-gray-500 border-gray-700/60",
};

const BADGE_EMOJI: Record<DocCategory, string> = {
  Receipts: "📄",
  Insurance: "🛡️",
  Taxes: "💰",
  Medical: "🏥",
  School: "🎓",
  Military: "🪖",
  Manuals: "📖",
  Uncategorized: "📁",
};

const BADGE_LABEL: Record<DocCategory, string> = {
  Receipts: "Receipts",
  Insurance: "Insurance",
  Taxes: "Taxes",
  Medical: "Medical",
  School: "School",
  Military: "Military",
  Manuals: "Manuals",
  Uncategorized: "Uncategorized",
};

// ── Query parsing ───────────────────────────────────────────────────

/**
 * Parse a natural language query to extract category filters and search terms.
 *
 * Examples:
 * - "receipts from Lowe's" → category: Receipts, searchTerms: "lowe's"
 * - "insurance policy" → category: Insurance, searchTerms: "policy"
 * - "tax return 2024" → category: Taxes, searchTerms: "return 2024"
 * - "Lowe's" → category: null, searchTerms: "lowe's"
 */
function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed) return { category: null, searchTerms: "" };

  const lower = trimmed.toLowerCase();
  const allKeywords = getCategoryKeywords();

  // Build a flat map of lowercase keyword → category name
  const keywordToCategory: Record<string, string> = {};
  for (const [category, keywords] of Object.entries(allKeywords)) {
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      // Only use the first occurrence (shorter keywords may be substrings of longer ones)
      if (!keywordToCategory[lowerKw]) {
        keywordToCategory[lowerKw] = category;
      }
    }
  }

  // Sort keywords by length descending so we match longer phrases first
  const sortedKeywords = Object.keys(keywordToCategory).sort(
    (a, b) => b.length - a.length,
  );

  // Try to match the longest keyword at the start of the query
  let detectedCategory: DocCategory | null = null;
  let remaining = trimmed;

  for (const kw of sortedKeywords) {
    if (lower.startsWith(kw)) {
      const categoryName = keywordToCategory[kw];
      if (ALL_CATEGORIES.includes(categoryName as DocCategory) && categoryName !== "Uncategorized") {
        detectedCategory = categoryName as DocCategory;
        // Remove the matched keyword and any following "from", "for", "in", etc.
        const afterKw = trimmed.slice(kw.length);
        remaining = afterKw.replace(/^\s+(from|for|in|about|with|of)\s+/i, "").trim();
        break;
      }
    }
  }

  return {
    category: detectedCategory,
    searchTerms: remaining,
  };
}

// ── Search algorithm ────────────────────────────────────────────────

const SNIPPET_RADIUS = 50;

/**
 * Score a single document against search terms.
 * Higher score = more relevant.
 * Scoring: match count * 10 + position bonus (earlier match = higher bonus).
 */
function scoreDocument(doc: CloudDocument, lowerTerms: string): number {
  const text = (doc.ocrText || "").toLowerCase();
  if (!text || !lowerTerms) return 0;

  let score = 0;
  let pos = 0;
  while (true) {
    pos = text.indexOf(lowerTerms, pos);
    if (pos === -1) break;
    // Match count bonus
    score += 10;
    // Position bonus: earlier matches get higher bonus
    // Max bonus ~100 for a match at position 0, tapering to ~0 at position 5000
    const positionBonus = Math.max(0, 100 - pos / 50);
    score += positionBonus;
    pos += lowerTerms.length;
  }

  return score;
}

/**
 * Extract a snippet of text around the first match, with match indices for highlighting.
 */
function extractSnippet(
  text: string,
  lowerTerms: string,
): { snippet: string; matchIndices: Array<{ start: number; end: number }> } {
  const lower = text.toLowerCase();
  const matchPos = lower.indexOf(lowerTerms);

  if (matchPos === -1) {
    return { snippet: text.slice(0, SNIPPET_RADIUS * 2), matchIndices: [] };
  }

  // Calculate snippet window around the match
  const matchEnd = matchPos + lowerTerms.length;
  const snippetStart = Math.max(0, matchPos - SNIPPET_RADIUS);
  const snippetEnd = Math.min(text.length, matchEnd + SNIPPET_RADIUS);

  let snippet = text.slice(snippetStart, snippetEnd);

  // Add ellipsis if truncated
  if (snippetStart > 0) snippet = "…" + snippet;
  if (snippetEnd < text.length) snippet = snippet + "…";

  // Calculate match positions within the snippet
  const matchStartInSnippet = matchPos - snippetStart + (snippetStart > 0 ? 1 : 0);
  const matchIndices = [
    { start: matchStartInSnippet, end: matchStartInSnippet + lowerTerms.length },
  ];

  return { snippet, matchIndices };
}

/**
 * Search all documents for matching text.
 *
 * @param docs - All cloud documents
 * @param query - Raw search query from user
 * @returns Sorted search results (highest score first)
 */
export function searchDocuments(
  docs: CloudDocument[],
  query: string,
): SearchResult[] {
  const parsed = parseQuery(query);
  const lowerTerms = parsed.searchTerms.toLowerCase();

  // If no search terms, return empty (no text search to do)
  if (!lowerTerms) return [];

  const results: SearchResult[] = [];

  for (const doc of docs) {
    const cat = getDocCategory(doc);

    // Apply category filter from parsed query
    if (parsed.category && cat !== parsed.category) continue;

    // Must have OCR text to search
    if (!doc.ocrText) continue;

    const score = scoreDocument(doc, lowerTerms);
    if (score === 0) continue;

    const { snippet, matchIndices } = extractSnippet(doc.ocrText, lowerTerms);

    results.push({
      doc,
      category: cat,
      score,
      snippet,
      matchIndices,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ── Search input component ──────────────────────────────────────────

interface DocumentSearchBarProps {
  query: string;
  resultCount: number;
  onChange: (value: string) => void;
  onClear: () => void;
}

function SearchBar({ query, resultCount, onChange, onClear }: DocumentSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Search icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search your documents… (e.g. 'receipts from Lowe's', 'insurance policy')"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        {/* Clear button */}
        {query && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition hover:text-gray-300 hover:bg-gray-800"
            title="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Result count */}
      {query && (
        <p className="text-xs text-gray-500">
          {resultCount === 0
            ? "No results"
            : `${resultCount} result${resultCount === 1 ? "" : "s"} for "${query}"`}
        </p>
      )}
    </div>
  );
}

// ── Search results component ────────────────────────────────────────

interface DocumentSearchResultsProps {
  results: SearchResult[];
  query: string;
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
}

function SearchResults({
  results,
  query,
  deletingDocId,
  onDownload,
  onDelete,
}: DocumentSearchResultsProps) {
  // Group results by category
  const grouped = useMemo(() => {
    const map = new Map<DocCategory, SearchResult[]>();
    for (const r of results) {
      const existing = map.get(r.category) || [];
      existing.push(r);
      map.set(r.category, existing);
    }
    return map;
  }, [results]);

  // Highlight matching text within a snippet
  const highlightSnippet = (snippet: string, indices: Array<{ start: number; end: number }>) => {
    if (indices.length === 0) return snippet;

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    for (const { start, end } of indices) {
      if (start > lastEnd) {
        parts.push(snippet.slice(lastEnd, start));
      }
      parts.push(
        <mark key={start} className="rounded bg-yellow-500/30 text-yellow-200 px-0.5">
          {snippet.slice(start, end)}
        </mark>,
      );
      lastEnd = end;
    }
    if (lastEnd < snippet.length) {
      parts.push(snippet.slice(lastEnd));
    }

    return <>{parts}</>;
  };

  if (results.length === 0) {
    return (
      <div className="py-8 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto h-10 w-10 text-gray-700 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <p className="text-sm text-gray-400">No documents found for "{query}"</p>
        <p className="mt-1 text-xs text-gray-600">
          Try a different search term, or scan a document with OCR to make it searchable.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto">
      {Array.from(grouped.entries()).map(([cat, catResults]) => (
        <div key={cat}>
          {/* Category header */}
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className="text-sm">{BADGE_EMOJI[cat]}</span>
            <span className="text-xs font-medium text-gray-400">{BADGE_LABEL[cat]}</span>
            <span className="text-[10px] text-gray-600">
              {catResults.length} result{catResults.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Results in this category */}
          <div className="space-y-1.5">
            {catResults.map((result) => (
              <div
                key={result.doc.id}
                className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3 transition hover:border-gray-700"
              >
                {/* Thumbnail icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-indigo-900/40 text-indigo-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                </div>

                <div className="flex-1 min-w-0 text-left">
                  {/* Document name */}
                  <p className="truncate text-sm font-medium text-gray-200">
                    {result.doc.name}
                  </p>

                  {/* Meta line: pages + date + category badge */}
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-xs text-gray-500">
                      {result.doc.pageCount}{" "}
                      {result.doc.pageCount === 1 ? "page" : "pages"}{" "}
                      ·{" "}
                      {new Date(result.doc.date).toLocaleDateString()}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-medium ${BADGE_STYLES[result.category]}`}
                    >
                      <span className="text-[10px] leading-none">
                        {BADGE_EMOJI[result.category]}
                      </span>
                      {BADGE_LABEL[result.category]}
                    </span>
                  </div>

                  {/* Snippet with highlighted match */}
                  {result.snippet && (
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {highlightSnippet(result.snippet, result.matchIndices)}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onDownload(result.doc)}
                    className="rounded p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                    title="Download"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(result.doc.id)}
                    disabled={deletingDocId === result.doc.id}
                    className="rounded p-1.5 text-gray-400 transition hover:bg-red-900/50 hover:text-red-400 disabled:opacity-50"
                    title="Delete"
                  >
                    {deletingDocId === result.doc.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main DocumentSearch component ────────────────────────────────────

interface DocumentSearchProps {
  scans: CloudDocument[];
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
  onClear: () => void;
}

export function DocumentSearch({
  scans,
  deletingDocId,
  onDownload,
  onDelete,
  onClear,
}: DocumentSearchProps) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce input (300ms)
  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Search results based on debounced query
  const results = useMemo(
    () => searchDocuments(scans, debouncedQuery),
    [scans, debouncedQuery],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    onClear();
  }, [onClear]);

  // When the search input is cleared (empty query), trigger onClear
  const handleInputChange = useCallback(
    (value: string) => {
      handleChange(value);
      if (value === "") {
        // Immediately clear debounced query when input is cleared
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setDebouncedQuery("");
      }
    },
    [handleChange],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-200">Search Documents</h3>
        <button
          onClick={handleClear}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Back to folders
        </button>
      </div>

      <SearchBar
        query={query}
        resultCount={debouncedQuery ? results.length : 0}
        onChange={handleInputChange}
        onClear={handleClear}
      />

      {debouncedQuery && (
        <SearchResults
          results={results}
          query={debouncedQuery}
          deletingDocId={deletingDocId}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      )}

      {!debouncedQuery && (
        <p className="py-4 text-center text-sm text-gray-500">
          Type to search across your documents by keyword or category
        </p>
      )}
    </div>
  );
}
