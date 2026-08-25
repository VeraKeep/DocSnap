/**
 * BookSnap module — shared data types.
 *
 * BookSnap turns books into searchable memory. Instead of remembering books,
 * users remember ideas — and BookSnap answers "which book, chapter, page,
 * paragraph, quote" instantly, with strict provenance (book, edition, page,
 * paragraph) on every answer.
 *
 * Stage 1 (this MVP-1) covers the book data model + "Add a book" (manual
 * metadata + optional PDF text ingest) + a bookshelf list. Page-aware reading,
 * highlighting/notes, and search arrive in later stages.
 *
 * PROVENANCE is foundational: `source_text` stores the book's own extracted
 * text as an immutable anchor source (the user's licensed copy, for their own
 * use — never redistributed). `original_file_ref` stores only a URL/name,
 * never a redistributable copy of the file. The system never fabricates
 * quotes or page numbers.
 */

/** A book's shelf row (metadata, no heavy content payload). */
export interface BookRow {
  id: number;
  isbn: string | null;
  title: string;
  author: string | null;
  edition: string | null;
  publisher: string | null;
  year: string | null;
  cover_url: string | null;
  reading_status: string; // unread | reading | finished
  collection: string | null;
  tags: string[];
  original_file_ref: string | null;
  page_count: number | null;
  analysis_status: string; // pending | complete
  created_at: string | null;
}

/** A full book with its immutable extracted source text. */
export interface BookDetail extends BookRow {
  sourceText: string;
}

/** Response from listBooks. `configured` is false when storage is disconnected. */
export interface BookListResponse {
  configured: boolean;
  books: BookRow[];
}

/** Response from getBook. `book` is null when not found / storage off. */
export interface BookDetailResponse {
  configured: boolean;
  book: BookDetail | null;
}

/** The add-a-book input; all fields optional except title. */
export interface CreateBookInput {
  title: string;
  author?: string | null;
  isbn?: string | null;
  edition?: string | null;
  publisher?: string | null;
  year?: string | null;
  coverUrl?: string | null;
  readingStatus?: string | null;
  collection?: string | null;
  tags?: string[];
  /** Uploaded PDF url/name only (never a redistributable copy). */
  originalFileRef?: string | null;
  /** Extracted full text (immutable anchor source). */
  sourceText?: string;
  pageCount?: number | null;
}

/** Response from createBook — round-trips the resulting row. */
export interface CreateBookResponse {
  configured: boolean;
  book: BookDetail | null;
}

/** Response from deleteBook. */
export interface DeleteBookResponse {
  configured: boolean;
  ok: boolean;
}

/* ------------------------------------------------------------------ */
/* Stage 2 — page-aware read & annotate                                */
/* ------------------------------------------------------------------ */

/** One immutable, stored page anchor (book_pages row). */
export interface BookPage {
  id: number;
  bookId: number;
  pageNumber: number;
  text: string;
}

/** Input for ingesting pages (client-extracted, page_number + paragraph text). */
export interface BookPageInput {
  pageNumber: number;
  text: string;
}

/** A user annotation anchored to a concrete edition + page + paragraph. */
export interface BookAnnotation {
  id: number;
  bookId: number;
  pageId: number | null;
  /** Derived from the page — carries provenance (edition + page + paragraph). */
  pageNumber: number | null;
  paragraphIndex: number | null;
  quote: string;
  note: string | null;
  color: string;
  createdAt: string | null;
}

/** Response from getBookPages — a window of pages for one book. */
export interface GetBookPagesResponse {
  configured: boolean;
  bookId: number;
  /** Total pages stored for this book (for range UI). */
  total: number;
  pages: BookPage[];
}

/** Response from ingestBookPages. */
export interface IngestPagesResponse {
  configured: boolean;
  bookId: number;
  count: number;
}

/** Input for createAnnotation — every value anchored to a page + paragraph. */
export interface CreateAnnotationInput {
  bookId: number;
  pageId: number;
  paragraphIndex: number;
  quote: string;
  note?: string | null;
  color?: string;
}

/** Response from createAnnotation. */
export interface CreateAnnotationResponse {
  configured: boolean;
  annotation: BookAnnotation | null;
}

/** Response from listAnnotations. */
export interface ListAnnotationsResponse {
  configured: boolean;
  annotations: BookAnnotation[];
}

/** Response from deleteAnnotation. */
export interface DeleteAnnotationResponse {
  configured: boolean;
  ok: boolean;
}
