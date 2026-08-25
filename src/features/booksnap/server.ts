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
  type BookDetail,
  type BookDetailResponse,
  type BookListResponse,
  type BookRow,
  type CreateBookResponse,
  type DeleteBookResponse,
} from "./types";

const MAX_TEXT_LENGTH = 2_000_000; // generous safe cap on a book's raw text
const MAX_FIELD_LENGTH = 300; // cap on individual metadata fields
const MAX_TAGS = 50;
const READING_STATUSES = new Set(["unread", "reading", "finished"]);

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
        page_count: data.pageCount,
        analysis_status: data.sourceText ? "complete" : "pending",
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
        ${data.originalFileRef}, ${data.sourceText}, ${data.pageCount},
        ${data.sourceText ? "complete" : "pending"}
      )
      RETURNING id
    `) as Record<string, unknown>[];
    const bookId = Number(insert[0]?.id);

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
      page_count: data.pageCount,
      analysis_status: data.sourceText ? "complete" : "pending",
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
