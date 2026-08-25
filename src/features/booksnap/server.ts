/**
 * BookSnap module — owner-scoped server functions.
 *
 * Book data is personal and scoped to exactly one Clerk user. The owner
 * identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); a client-supplied owner id is never trusted. All
 * queries filter by the server-resolved owner, so no cross-user reads are
 * possible.
 *
 * Persistence mirrors the rest of DocSnap: `~/db` (Neon Postgres) and the host
 * schema (src/db-schema.sql). When DATABASE_URL is unset, `sql()` no-ops
 * safely, so the module still builds and the add-a-book flow works in a
 * session-only demo path with an honest "storage not connected" signal.
 *
 * PROVENANCE guardrails: `source_text` stores the book's own extracted text as
 * an immutable anchor source; `original_file_ref` stores only a URL/name,
 * never a redistributable copy. This stage stores metadata + raw text only —
 * page-aware reading, highlighting/notes, and search come in later stages.
 * Nothing is fabricated.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import {
  type BookAnnotation,
  type BookDetail,
  type BookDetailResponse,
  type BookListResponse,
  type BookPage,
  type BookRow,
  type BookSearchInput,
  type BookSearchResponse,
  type BookSearchResult,
  type CreateAnnotationResponse,
  type CreateBookResponse,
  type DeleteAnnotationResponse,
  type DeleteBookResponse,
  type GetBookPagesResponse,
  type IngestPagesResponse,
  type ListAnnotationsResponse,
} from "./types";

const MAX_TEXT_LENGTH = 2_000_000; // generous safe cap on a book's raw text
const MAX_FIELD_LENGTH = 300; // cap on individual metadata fields
const MAX_TAGS = 50;
const READING_STATUSES = new Set(["unread", "reading", "finished"]);

const MAX_PAGE_TEXT = 200_000; // safe cap on a single page's stored text
const PAGE_WINDOW = 1; // default getBookPages window (one page at a time)
const MAX_PAGES_PER_INGEST = 4_000; // sanity cap on ingest payload size

/** Normalize whitespace for provenance comparison of quotes to page text. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Small robust parsing helpers (same convention as ContractSnap)      */
/* ------------------------------------------------------------------ */
function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  return String(v).trim() || null;
}

/** Parse a JSONB tags column that may arrive as an array or a JSON string. */
function asTags(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((t) => asString(t) ?? "")
      .filter(Boolean)
      .slice(0, MAX_TAGS);
  }
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return asTags(parsed);
    } catch {
      /* not JSON — ignore */
    }
    // Comma-separated fallback for plain text.
    return v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS);
  }
  return [];
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/* ------------------------------------------------------------------ */
/* Row mapper                                                          */
/* ------------------------------------------------------------------ */
function toRow(r: Record<string, unknown>): BookRow {
  return {
    id: Number(r.id),
    isbn: asString(r.isbn),
    title: asString(r.title) ?? "Untitled book",
    author: asString(r.author),
    edition: asString(r.edition),
    publisher: asString(r.publisher),
    year: asString(r.year),
    cover_url: asString(r.cover_url),
    reading_status: asString(r.reading_status) ?? "unread",
    collection: asString(r.collection),
    tags: asTags(r.tags),
    original_file_ref: asString(r.original_file_ref),
    page_count: asInt(r.page_count),
    analysis_status: asString(r.analysis_status) ?? "pending",
    created_at: r.created_at == null ? null : String(r.created_at),
  };
}

function toDetail(r: Record<string, unknown>): BookDetail {
  return {
    ...toRow(r),
    sourceText: String(r.source_text ?? ""),
  };
}

/* ------------------------------------------------------------------ */
/* Handlers                                                           */
/* ------------------------------------------------------------------ */
export const listBooks = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookListResponse> => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, books: [] };
    const rows = (await sql`
      SELECT id, isbn, title, author, edition, publisher, year, cover_url,
             reading_status, collection, tags, original_file_ref, page_count,
             analysis_status, created_at
      FROM books
      WHERE clerk_user_id = ${userId}
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return { configured: true, books: rows.map(toRow) };
  },
);

export const getBook = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid book id.");
    return { id };
  })
  .handler(async (opts): Promise<BookDetailResponse> => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, book: null };
    const rows = (await sql`
      SELECT id, isbn, title, author, edition, publisher, year, cover_url,
             reading_status, collection, tags, original_file_ref, page_count,
             analysis_status, created_at, source_text
      FROM books
      WHERE id = ${opts.data.id} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return { configured: true, book: null };
    return { configured: true, book: toDetail(r) };
  });

/**
 * Add a book to the user's bookshelf from manual metadata + optional PDF text
 * ingest. Validates the manual metadata (title is required; every field is
 * length-capped) and optionally persists the uploaded PDF's extracted text into
 * `source_text`. Degrades gracefully: when DATABASE_URL is absent, sql() no-ops
 * and the book is returned session-only with configured:false.
 */
export const createBook = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const title = asString(d.title);
    if (!title) throw new Error("A book title is required.");
    if (title.length > MAX_FIELD_LENGTH) {
      throw new Error("That title is too long. Please shorten it.");
    }
    const cap = (v: unknown) => {
      const s = asString(v);
      return s ? s.slice(0, MAX_FIELD_LENGTH) : null;
    };
    let readingStatus = cap(d.readingStatus) ?? "unread";
    if (!READING_STATUSES.has(readingStatus)) readingStatus = "unread";

    const rawTags = Array.isArray(d.tags) ? d.tags : [];
    const tags: string[] = rawTags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean)
      .slice(0, MAX_TAGS);

    const sourceText = typeof d.sourceText === "string" ? d.sourceText : "";
    if (sourceText.length > MAX_TEXT_LENGTH) {
      throw new Error("That book is too large to store. Please use a smaller PDF.");
    }

    // Optional client-extracted per-page text (from pdfExtract.ts). Same
    // validation as ingestBookPages so adding a book feeds the reader directly.
    const rawPages = Array.isArray(d.pages) ? d.pages : [];
    const pages: { pageNumber: number; text: string }[] = [];
    for (const p of rawPages) {
      const pp = (p ?? {}) as { pageNumber?: unknown; text?: unknown };
      const pageNumber = Number(pp.pageNumber);
      const text = typeof pp.text === "string" ? pp.text.slice(0, MAX_PAGE_TEXT) : "";
      if (Number.isInteger(pageNumber) && pageNumber >= 1 && text.trim()) {
        pages.push({ pageNumber, text });
      }
    }
    if (pages.length > MAX_PAGES_PER_INGEST) {
      throw new Error("That book has too many pages to store.");
    }

    return {
      title,
      author: cap(d.author),
      isbn: cap(d.isbn),
      edition: cap(d.edition),
      publisher: cap(d.publisher),
      year: cap(d.year),
      coverUrl: cap(d.coverUrl),
      readingStatus,
      collection: cap(d.collection),
      tags,
      originalFileRef: cap(d.originalFileRef),
      sourceText,
      pages,
      pageCount: asInt(d.pageCount),
    };
  })
  .handler(async (opts): Promise<CreateBookResponse> => {
    const userId = await requireServerFunctionUser();
    const data = opts.data;

    if (!process.env.DATABASE_URL) {
      // Session-only demo path (sql() no-ops).
      const book: BookDetail = {
        id: 0,
        isbn: data.isbn,
        title: data.title,
        author: data.author,
        edition: data.edition,
        publisher: data.publisher,
        year: data.year,
        cover_url: data.coverUrl,
        reading_status: data.readingStatus,
        collection: data.collection,
        tags: data.tags,
        original_file_ref: data.originalFileRef,
        page_count: data.pages.length ? data.pages.length : data.pageCount,
        analysis_status: data.pages.length || data.sourceText ? "complete" : "pending",
        created_at: null,
        sourceText: data.sourceText,
      };
      return { configured: false, book };
    }

    const insert = (await sql`
      INSERT INTO books (
        clerk_user_id, isbn, title, author, edition, publisher, year, cover_url,
        reading_status, collection, tags, original_file_ref, source_text,
        page_count, analysis_status
      ) VALUES (
        ${userId}, ${data.isbn}, ${data.title}, ${data.author}, ${data.edition},
        ${data.publisher}, ${data.year}, ${data.coverUrl}, ${data.readingStatus},
        ${data.collection}, ${JSON.stringify(data.tags)}::jsonb,
        ${data.originalFileRef}, ${data.sourceText},
        ${data.pages.length ? data.pages.length : data.pageCount},
        ${data.pages.length || data.sourceText ? "complete" : "pending"}
      )
      RETURNING id
    `) as Record<string, unknown>[];
    const bookId = Number(insert[0]?.id);

    // Auto-ingest the attached PDF's pages into book_pages so the book is
    // immediately readable in BookReader (no duplicate re-upload). The book is
    // brand-new, so there are no pre-existing pages to duplicate; each page row
    // is an immutable anchor owned by this user.
    if (data.pages.length) {
      for (const p of data.pages) {
        await sql`
          INSERT INTO book_pages (book_id, page_number, text)
          VALUES (${bookId}, ${p.pageNumber}, ${p.text})
        `;
      }
    }

    const book: BookDetail = {
      id: bookId,
      isbn: data.isbn,
      title: data.title,
      author: data.author,
      edition: data.edition,
      publisher: data.publisher,
      year: data.year,
      cover_url: data.coverUrl,
      reading_status: data.readingStatus,
      collection: data.collection,
      tags: data.tags,
      original_file_ref: data.originalFileRef,
      page_count: data.pages.length ? data.pages.length : data.pageCount,
      analysis_status: data.pages.length || data.sourceText ? "complete" : "pending",
      created_at: new Date().toISOString(),
      sourceText: data.sourceText,
    };
    return { configured: true, book };
  });

export const deleteBook = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid book id.");
    return { id };
  })
  .handler(async (opts): Promise<DeleteBookResponse> => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) throw new Error("Storage isn't connected yet.");
    const rows = (await sql`
      DELETE FROM books WHERE id = ${opts.data.id} AND clerk_user_id = ${userId}
      RETURNING id
    `) as Record<string, unknown>[];
    return { configured: true, ok: rows.length > 0 };
  });

/* ------------------------------------------------------------------ */
/* Stage 2 — page-aware read & annotate                                */
/* ------------------------------------------------------------------ */

function toPage(r: Record<string, unknown>): BookPage {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    pageNumber: Number(r.page_number),
    text: String(r.text ?? ""),
  };
}

function toAnnotation(r: Record<string, unknown>): BookAnnotation {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    pageId: r.page_id == null ? null : Number(r.page_id),
    pageNumber: r.page_number == null ? null : Number(r.page_number),
    paragraphIndex: r.paragraph_index == null ? null : Number(r.paragraph_index),
    quote: String(r.quote ?? ""),
    note: r.note == null ? null : String(r.note),
    color: String(r.color ?? "amber"),
    createdAt: r.created_at == null ? null : String(r.created_at),
  };
}

/**
 * Persist client-extracted per-page text (from pdfExtract.ts) into the
 * immutable `book_pages` anchors for a book the user owns. Re-ingesting is
 * idempotent: existing pages (and their cascaded annotations) are replaced.
 * Degrades to a session-only count when DATABASE_URL is unset.
 */
export const ingestBookPages = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { bookId?: unknown; pages?: unknown };
    const bookId = typeof d.bookId === "number" ? d.bookId : Number(d.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) throw new Error("Invalid book id.");
    const raw = Array.isArray(d.pages) ? d.pages : [];
    const pages: { pageNumber: number; text: string }[] = [];
    for (const p of raw) {
      const pp = (p ?? {}) as { pageNumber?: unknown; text?: unknown };
      const pageNumber = Number(pp.pageNumber);
      const text = typeof pp.text === "string" ? pp.text.slice(0, MAX_PAGE_TEXT) : "";
      if (Number.isInteger(pageNumber) && pageNumber >= 1 && text.trim()) {
        pages.push({ pageNumber, text });
      }
    }
    if (pages.length === 0) throw new Error("No readable pages were extracted.");
    if (pages.length > MAX_PAGES_PER_INGEST) throw new Error("That book has too many pages to store.");
    return { bookId, pages };
  })
  .handler(async (opts): Promise<IngestPagesResponse> => {
    const userId = await requireServerFunctionUser();
    const { bookId, pages } = opts.data;
    if (!process.env.DATABASE_URL) return { configured: false, bookId, count: pages.length };

    const owned = (await sql`
      SELECT id FROM books WHERE id = ${bookId} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!owned[0]) throw new Error("Book not found.");

    // Idempotent re-ingest: replace this book's stored pages (annotations
    // anchored to old pages are cascaded away on delete).
    await sql`DELETE FROM book_pages WHERE book_id = ${bookId}`;
    for (const p of pages) {
      await sql`
        INSERT INTO book_pages (book_id, page_number, text)
        VALUES (${bookId}, ${p.pageNumber}, ${p.text})
      `;
    }
    await sql`
      UPDATE books SET page_count = ${pages.length}, analysis_status = 'complete'
      WHERE id = ${bookId}
    `;
    return { configured: true, bookId, count: pages.length };
  });

/**
 * Read one page (a small window around `page`) of a book the user owns. Loads
 * a bounded window rather than the whole book so large books stay responsive.
 */
export const getBookPages = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { bookId?: unknown; page?: unknown; limit?: unknown };
    const bookId = typeof d.bookId === "number" ? d.bookId : Number(d.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) throw new Error("Invalid book id.");
    const page = Math.max(1, Math.floor(Number(d.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(d.limit) || PAGE_WINDOW)));
    return { bookId, page, limit };
  })
  .handler(async (opts): Promise<GetBookPagesResponse> => {
    const userId = await requireServerFunctionUser();
    const { bookId, page, limit } = opts.data;
    if (!process.env.DATABASE_URL) return { configured: false, bookId, total: 0, pages: [] };

    const owned = (await sql`
      SELECT id FROM books WHERE id = ${bookId} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!owned[0]) throw new Error("Book not found.");

    const countRows = (await sql`
      SELECT COUNT(*)::int AS c FROM book_pages WHERE book_id = ${bookId}
    `) as Record<string, unknown>[];
    const total = Number(countRows[0]?.c ?? 0);

    const rows = (await sql`
      SELECT id, book_id, page_number, text FROM book_pages
      WHERE book_id = ${bookId} AND page_number >= ${page}
      ORDER BY page_number
      LIMIT ${limit}
    `) as Record<string, unknown>[];
    return { configured: true, bookId, total, pages: rows.map(toPage) };
  });

/**
 * Create a highlight/note anchored to a concrete page + paragraph. Quotes are
 * NOT fabricated: the requested quote must be found inside that page's stored
 * text (whitespace-normalized) or the write is rejected.
 */
export const createAnnotation = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const bookId = Number(d.bookId);
    const pageId = Number(d.pageId);
    const paragraphIndex = Number(d.paragraphIndex);
    const quote = typeof d.quote === "string" ? d.quote.trim().slice(0, 10_000) : "";
    if (!Number.isInteger(bookId) || bookId <= 0) throw new Error("Invalid book id.");
    if (!Number.isInteger(pageId) || pageId <= 0) throw new Error("Invalid page id.");
    if (!quote) throw new Error("Select some text first to create a highlight.");
    let note: string | null = typeof d.note === "string" && d.note.trim() ? d.note.trim().slice(0, 20_000) : null;
    if (note === "") note = null;
    const color = typeof d.color === "string" && d.color.trim() ? d.color.trim().slice(0, 30) : "amber";
    return {
      bookId,
      pageId,
      paragraphIndex: Number.isInteger(paragraphIndex) && paragraphIndex >= 0 ? paragraphIndex : null,
      quote,
      note,
      color,
    };
  })
  .handler(async (opts): Promise<CreateAnnotationResponse> => {
    const userId = await requireServerFunctionUser();
    const { bookId, pageId, paragraphIndex, quote, note, color } = opts.data;
    if (!process.env.DATABASE_URL) return { configured: false, annotation: null };

    // Verify the page belongs to a book the user owns, and grab its page_number.
    const pageRows = (await sql`
      SELECT bp.id, bp.page_number, bp.text
      FROM book_pages bp
      JOIN books b ON b.id = bp.book_id
      WHERE bp.id = ${pageId} AND bp.book_id = ${bookId} AND b.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    const page = pageRows[0];
    if (!page) throw new Error("Page not found.");

    // Provenance: the quote must literally exist in this page's text.
    const pageText = normalizeWs(String(page.text ?? ""));
    if (!pageText || !normalizeWs(quote) || !pageText.includes(normalizeWs(quote))) {
      throw new Error(
        "That text wasn't found on this page. Quotes must come from the book's text — nothing is fabricated.",
      );
    }

    const inserted = (await sql`
      INSERT INTO book_annotations (book_id, page_id, paragraph_index, quote, note, color)
      VALUES (${bookId}, ${pageId}, ${paragraphIndex}, ${quote}, ${note}, ${color})
      RETURNING id, book_id, page_id, paragraph_index, quote, note, color, created_at
    `) as Record<string, unknown>[];
    const row = inserted[0];
    if (!row) return { configured: true, annotation: null };
    return {
      configured: true,
      annotation: toAnnotation({ ...row, page_number: page.page_number }),
    };
  });

/** List a user's annotations for a book, with page numbers resolved. */
export const listAnnotations = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { bookId?: unknown };
    const bookId = Number(d.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) throw new Error("Invalid book id.");
    return { bookId };
  })
  .handler(async (opts): Promise<ListAnnotationsResponse> => {
    const userId = await requireServerFunctionUser();
    const { bookId } = opts.data;
    if (!process.env.DATABASE_URL) return { configured: false, annotations: [] };

    const owned = (await sql`
      SELECT id FROM books WHERE id = ${bookId} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!owned[0]) throw new Error("Book not found.");

    const rows = (await sql`
      SELECT a.id, a.book_id, a.page_id, a.paragraph_index, a.quote, a.note,
             a.color, a.created_at, p.page_number
      FROM book_annotations a
      LEFT JOIN book_pages p ON p.id = a.page_id
      WHERE a.book_id = ${bookId}
      ORDER BY a.created_at DESC
    `) as Record<string, unknown>[];
    return { configured: true, annotations: rows.map(toAnnotation) };
  });

/** Delete one of the user's own annotations. */
export const deleteAnnotation = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; bookId?: unknown };
    const id = Number(d.id);
    const bookId = Number(d.bookId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid annotation id.");
    if (!Number.isInteger(bookId) || bookId <= 0) throw new Error("Invalid book id.");
    return { id, bookId };
  })
  .handler(async (opts): Promise<DeleteAnnotationResponse> => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) throw new Error("Storage isn't connected yet.");
    // Resolve the annotation's book owner to prevent cross-user deletes.
    const rows = (await sql`
      DELETE FROM book_annotations
      WHERE id = ${opts.data.id}
        AND book_id = ${opts.data.bookId}
        AND book_id IN (SELECT id FROM books WHERE clerk_user_id = ${userId})
      RETURNING id
    `) as Record<string, unknown>[];
    return { configured: true, ok: rows.length > 0 };
  });

/* ------------------------------------------------------------------ */
/* Stage 3 — full-text keyword search over book content                */
/* ------------------------------------------------------------------ */
/**
 * Deterministic keyword search over a user's OWN stored book pages. This reuses
 * the exact ContractSnap search pattern (stopwords + term/synonym expansion +
 * loose-substring corpus scoring) — copied here so the modules stay decoupled,
 * per the codebase convention. Search runs over `book_pages.text` (the user's
 * own stored page text) plus book metadata (title/author/edition/publisher/
 * year/collection/tags).
 *
 * PROVENANCE: every result is attributed to a concrete book + edition + page (+
 * paragraph when determinable). The snippet is taken VERBATIM from the user's
 * own stored page text — quotes and page numbers are never fabricated. Only the
 * user's own library is searched (owner-scoped by `clerk_user_id`).
 */
const SEARCH_STOPWORDS = new Set([
  "which", "who", "what", "when", "where", "why", "how", "the", "a", "an",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "i", "me", "my", "mine", "we", "our", "ours", "us", "you", "your", "yours",
  "they", "them", "their", "it", "its", "of", "to", "in", "on", "at", "for",
  "with", "and", "or", "that", "this", "these", "those", "will", "would", "can",
  "could", "should", "shall", "have", "has", "had", "about", "from", "by", "as",
  "all", "any", "some", "get", "gets", "show", "find", "list", "tell", "said",
  "than", "then", "also", "into", "each", "more", "most", "other", "such",
  // book-domain boilerplate that shouldn't gate a search
  "book", "books", "chapter", "chapters", "page", "pages", "volume", "edition",
  "author", "story", "part", "section", "let", "lets", "there",
]);

/** Light synonym expansion — book/search vocabulary, loose-substring matched. */
const SEARCH_ALIASES: Record<string, string> = {
  climate: " climate warming temperature weather ",
  warming: " climate warming ",
  environment: " environment environmental ecology ecological ",
  ecology: " ecology ecological environment ",
  history: " history historical past ",
  war: " war wars battle combat ",
  love: " love loves loved romance romantic ",
  philosophy: " philosophy philosophical thought ideas ",
  science: " science scientific research ",
  psychology: " psychology psychological mind behavior behaviour ",
  economics: " economics economic economy financial money ",
  money: " money economic finance financial cost price ",
  death: " death dying die dead mortality ",
  time: " time temporal duration past future ",
  space: " space spatial universe cosmos ",
  universe: " universe cosmos space astronomical ",
  quantum: " quantum quanta mechanics ",
};

/** Tokenize a natural-language query into substantive search terms. */
function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[\u2014\u2013]/g, " ")
    .replace(/[^a-z0-9$€£%.,+\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/[\s,.]+/)
    .filter((t) => t.length > 1 && !SEARCH_STOPWORDS.has(t));
}

/** Expand each query term (plus synonyms) into a list of loose substrings. */
function expandTerms(terms: string[]): { raw: string; needles: string[] }[] {
  return terms.map((raw) => {
    const aliased = (SEARCH_ALIASES[raw] ?? "").split(/\s+/).filter(Boolean);
    return { raw, needles: [raw, ...aliased] };
  });
}

/** Loose substring scoring: stronger for longer / more specific terms. */
function scoreCorpus(corpus: string, terms: { raw: string; needles: string[] }[]): number {
  let score = 0;
  for (const t of terms) {
    if (t.needles.some((n) => n.length > 1 && corpus.includes(n))) {
      score += Math.max(2, t.raw.length);
    }
  }
  return score;
}

/** True when EVERY substantive query term matches the corpus. */
function allTermsMatch(corpus: string, terms: { raw: string; needles: string[] }[]): boolean {
  return terms.every((t) => t.needles.some((n) => n.length > 1 && corpus.includes(n)));
}

/**
 * Resolve the matched paragraph (0-based index) + a verbatim snippet for a
 * matched page. Returns the first paragraph that contains any needle; falls
 * back to the page's opening text with paragraphIndex null when there are no
 * clean paragraph boundaries. The snippet is always real stored page text.
 */
function pageSnippet(
  pageText: string,
  needles: string[],
  maxLength = 360,
): { paragraphIndex: number | null; snippet: string } {
  const paragraphs = pageText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const lower = paragraphs.map((p) => p.toLowerCase());
  for (let i = 0; i < paragraphs.length; i++) {
    if (needles.some((n) => n.length > 1 && lower[i].includes(n))) {
      const para = paragraphs[i];
      return {
        paragraphIndex: i,
        snippet: para.length > maxLength ? `${para.slice(0, maxLength).trimEnd()}…` : para,
      };
    }
  }
  const first = paragraphs[0] ?? pageText.slice(0, maxLength).trim();
  return {
    paragraphIndex: null,
    snippet: first.length > maxLength ? `${first.slice(0, maxLength).trimEnd()}…` : first,
  };
}

/** Which metadata field the query matched (for the result card's matchedOn). */
function metadataMatchKind(
  terms: { raw: string; needles: string[] }[],
  title: string,
  author: string | null,
): "title" | "author" | "metadata" | null {
  const hit = (s: string) =>
    terms.some((t) => t.needles.some((n) => n.length > 1 && s.toLowerCase().includes(n)));
  if (hit(title)) return "title";
  if (author && hit(author)) return "author";
  return null;
}

/**
 * Search the user's books (across the library, or a single book when
 * `bookId` is given) and return page-attributed results ranked by relevance.
 *
 * Ranking:
 *  - A page whose stored text actually contains a query term is a precise
 *    "content" hit, scored by term weight (longer terms weigh more) boosted by
 *    any metadata match, then ordered newest-book-first within ties.
 *  - A book whose metadata (title/author/etc.) matches but whose pages don't
 *    contain the term surfaces as ONE representative hit per book, attributed
 *    to its first page, so a "find this book" search isn't drowned by every
 *    page of that book. matchedOn reflects title/author/metadata.
 */
export const searchBooks = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as BookSearchInput;
    const query = typeof d.query === "string" ? d.query.trim() : "";
    if (!query) throw new Error("Enter a search term.");
    const bookId = d.bookId == null ? null : Number(d.bookId);
    if (bookId != null && (!Number.isInteger(bookId) || bookId <= 0)) {
      throw new Error("Invalid book id.");
    }
    const limit = Math.min(60, Math.max(1, Math.floor(Number(d.limit) || 40)));
    return { query: query.slice(0, 200), bookId, limit };
  })
  .handler(async (opts): Promise<BookSearchResponse> => {
    const userId = await requireServerFunctionUser();
    const { query, bookId, limit } = opts.data;
    if (!process.env.DATABASE_URL) return { configured: false, query, noTerms: false, results: [] };

    const terms = expandTerms(searchTerms(query));
    if (terms.length === 0) {
      // Nothing substantive to search on ("show me my books") — return no
      // page-attributed hits rather than fabricating a page to point at.
      return { configured: true, query, noTerms: true, results: [] };
    }

    // `bookId` is a validated positive integer (see validator) so it is safe to
    // interpolate directly into the owner-scoped query.
    const bookFilter = bookId != null ? `AND bp.book_id = ${bookId}` : "";
    const rows = (await sql`
      SELECT bp.id AS page_id, bp.book_id, bp.page_number, bp.text AS page_text,
             b.title, b.author, b.edition, b.publisher, b.year, b.collection, b.tags
      FROM book_pages bp
      JOIN books b ON b.id = bp.book_id
      WHERE b.clerk_user_id = ${userId}
        ${bookFilter}
      ORDER BY b.created_at DESC, bp.page_number
    `) as Record<string, unknown>[];

    const contentHits: { r: Record<string, unknown>; score: number }[] = [];
    const metadataOnly = new Map<
      number,
      { r: Record<string, unknown>; score: number; kind: "title" | "author" | "metadata" }
    >();

    for (const r of rows) {
      const pageText = String(r.page_text ?? "").toLowerCase();
      const title = String(r.title ?? "");
      const author = asString(r.author);
      const metaParts: string[] = [title];
      if (author) metaParts.push(author);
      const edition = asString(r.edition);
      const publisher = asString(r.publisher);
      const year = asString(r.year);
      const collection = asString(r.collection);
      if (edition) metaParts.push(edition);
      if (publisher) metaParts.push(publisher);
      if (year) metaParts.push(year);
      if (collection) metaParts.push(collection);
      for (const t of asTags(r.tags)) metaParts.push(t);
      const metaCorpus = metaParts.join(" ").toLowerCase();

      // A page is a hit only when every substantive term matches somewhere in
      // its combined corpus (metadata + page text), keeping queries precise.
      const combined = `${metaCorpus} ${pageText}`;
      if (!allTermsMatch(combined, terms)) continue;

      const metaScore = scoreCorpus(metaCorpus, terms);
      const pageScore = scoreCorpus(pageText, terms);
      if (pageScore > 0) {
        // Precise page-content hit.
        contentHits.push({ r, score: pageScore * 2 + metaScore * 0.5 });
      } else {
        // Pure metadata match — keep one representative hit per book.
        const kind = metadataMatchKind(terms, title, author) ?? "metadata";
        const bookIdNum = Number(r.book_id);
        const existing = metadataOnly.get(bookIdNum);
        if (!existing || metaScore > existing.score) {
          metadataOnly.set(bookIdNum, { r, score: metaScore, kind });
        }
      }
    }

    // Books whose flat `source_text` matches but that have NO page anchors
    // (e.g. manually entered books, or PDF-added books whose pages were never
    // ingested) stay invisible to a pages-only search. Surface them here as
    // content hits too — the snippet comes verbatim from the user's own stored
    // `source_text`, and (because there are no page anchors) pageNumber/pageId
    // are null rather than fabricated. Books already producing a page-content
    // hit are skipped so a page-attributed hit is always preferred.
    const pageContentBookIds = new Set(contentHits.map((h) => Number(h.r.book_id)));
    const stBookFilter = bookId != null ? `AND b.id = ${bookId}` : "";
    const stRows = (await sql`
      SELECT b.id AS book_id, b.title, b.author, b.edition, b.publisher, b.year,
             b.collection, b.tags, b.source_text
      FROM books b
      WHERE b.clerk_user_id = ${userId}
        AND b.source_text IS NOT NULL AND LENGTH(b.source_text) > 0
        ${stBookFilter}
      ORDER BY b.created_at DESC
    `) as Record<string, unknown>[];
    const sourceTextHits: { r: Record<string, unknown>; score: number }[] = [];
    for (const r of stRows) {
      const bookIdNum = Number(r.book_id);
      if (pageContentBookIds.has(bookIdNum)) continue;
      const sourceText = String(r.source_text ?? "").toLowerCase();
      const title = String(r.title ?? "");
      const author = asString(r.author);
      const metaParts: string[] = [title];
      if (author) metaParts.push(author);
      const edition = asString(r.edition);
      const publisher = asString(r.publisher);
      const year = asString(r.year);
      const collection = asString(r.collection);
      if (edition) metaParts.push(edition);
      if (publisher) metaParts.push(publisher);
      if (year) metaParts.push(year);
      if (collection) metaParts.push(collection);
      for (const t of asTags(r.tags)) metaParts.push(t);
      const metaCorpus = metaParts.join(" ").toLowerCase();
      const combined = `${metaCorpus} ${sourceText}`;
      if (!allTermsMatch(combined, terms)) continue;
      const stScore = scoreCorpus(sourceText, terms);
      if (stScore <= 0) continue; // metadata-only matches are handled below (pages) / omitted (source-only)
      sourceTextHits.push({ r, score: stScore * 2 + scoreCorpus(metaCorpus, terms) * 0.5 });
    }
    sourceTextHits.sort((a, b) => b.score - a.score);

    // Rank content hits: score desc, then lower page number first.
    contentHits.sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.r.page_number) - Number(b.r.page_number),
    );

    const results: BookSearchResult[] = [];

    // Precise page-content hits (bounded by limit).
    for (const { r, score } of contentHits) {
      if (results.length >= limit) break;
      const { paragraphIndex, snippet } = pageSnippet(String(r.page_text ?? ""), terms.flatMap((t) => t.needles));
      results.push({
        bookId: Number(r.book_id),
        pageId: Number(r.page_id),
        pageNumber: Number(r.page_number),
        paragraphIndex,
        bookTitle: asString(r.title) ?? "Untitled book",
        author: asString(r.author),
        edition: asString(r.edition),
        publisher: asString(r.publisher),
        year: asString(r.year),
        snippet,
        matchedOn: "content",
        score: Math.round(score * 10) / 10,
      });
    }

    // source_text-content hits (books with no page anchors): same provenance
    // discipline — snippet verbatim from the user's own stored text, no page
    // number invented.
    for (const { r, score } of sourceTextHits) {
      if (results.length >= limit) break;
      const { paragraphIndex, snippet } = pageSnippet(String(r.source_text ?? ""), terms.flatMap((t) => t.needles));
      results.push({
        bookId: Number(r.book_id),
        pageId: null,
        pageNumber: null,
        paragraphIndex,
        bookTitle: asString(r.title) ?? "Untitled book",
        author: asString(r.author),
        edition: asString(r.edition),
        publisher: asString(r.publisher),
        year: asString(r.year),
        snippet,
        matchedOn: "content",
        score: Math.round(score * 10) / 10,
      });
    }

    // Representative metadata-only hits (one per book, attributed to first page).
    if (results.length < limit) {
      const metaList = Array.from(metadataOnly.values()).sort((a, b) => b.score - a.score);
      for (const { r, score, kind } of metaList) {
        if (results.length >= limit) break;
        results.push({
          bookId: Number(r.book_id),
          pageId: Number(r.page_id),
          pageNumber: Number(r.page_number),
          paragraphIndex: null,
          bookTitle: asString(r.title) ?? "Untitled book",
          author: asString(r.author),
          edition: asString(r.edition),
          publisher: asString(r.publisher),
          year: asString(r.year),
          snippet: String(r.page_text ?? "").trim().slice(0, 360),
          matchedOn: kind,
          score: Math.round(score * 10) / 10,
        });
      }
    }

    return { configured: true, query, noTerms: false, results };
  });
