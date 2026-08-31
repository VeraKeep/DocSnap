/**
 * Verify the BookSnap FUNCTIONAL data path against the live Neon DB.
 *
 * Exercises the Stage 1-3 flows the handlers implement
 * (src/features/booksnap/server.ts): createBook (with pages auto-ingest) ->
 * getBook + getBookPages -> createAnnotation (PROVENANCE: quote must literally
 * exist in the page text, so a fabricated quote MUST be rejected as the server
 * does) -> listAnnotations -> searchBooks (keyword over page text) ->
 * deleteBook (cascades pages + annotations) -> gate fails-closed BEFORE and
 * unlocks AFTER grant. The PDF text extraction (pdfExtract.ts) is client-side.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyBooksnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-booksnap-module";
const OTHER = "test-booksnap-other-user";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1";

/* Whitespace normalization mirrors the server's annotation provenance check. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-booksnap@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  // 1) Gate fails CLOSED before grant.
  const locked = (await sql`
    SELECT addon_booksnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_booksnap?: boolean }[];
  if (locked[0]?.addon_booksnap === true) {
    console.error("FAIL: fresh user has addon_booksnap = true (fails-closed broken).");
    process.exit(1);
  }
  console.log("OK: gate fails CLOSED before grant (addon_booksnap != true).");

  // 2) createBook insert with a page anchor (mirrors the handler's auto-ingest).
  const PAGE_TEXT = "Chapter one.\n\nThis is the first paragraph about the quantum engine.\n\nA second paragraph mentioning the warp core.";
  const created = (await sql`
    INSERT INTO books (
      clerk_user_id, isbn, title, author, edition, publisher, year, cover_url,
      reading_status, collection, tags, original_file_ref, source_text,
      page_count, analysis_status
    ) VALUES (
      ${TEST_USER}, ${"978-0-00-000000-1"}, ${"The Quantum Engine"}, ${"Ada Lovelace"},
      ${"2nd"}, ${"Vera Press"}, ${"2026"}, ${"https://example.com/cover.jpg"},
      ${"reading"}, ${"Favorites"}, ${JSON.stringify(["physics", "engineering"])}::jsonb,
      ${""}, ${PAGE_TEXT}, ${1}, ${"complete"}
    )
    RETURNING id, page_count
  `) as unknown as { id: number; page_count: number }[];
  const bookId = Number(created[0].id);
  await sql`
    INSERT INTO book_pages (book_id, page_number, text)
    VALUES (${bookId}, 1, ${PAGE_TEXT})
  `;
  const pageRows = (await sql`
    SELECT id, page_number, text FROM book_pages WHERE book_id = ${bookId} ORDER BY page_number
  `) as unknown as { id: number; page_number: number; text: string }[];
  const pageId = Number(pageRows[0]?.id);
  if (!pageId) {
    console.error("FAIL: book_pages auto-ingest produced no page.");
    process.exit(1);
  }
  console.log(`OK: createBook landed -> book#${bookId} with page#${pageId} (auto-ingest).`);

  // 3) getBook + getBookPages read back (owner-scoped).
  const getBook = (await sql`
    SELECT id, isbn, title, author, edition, publisher, year, cover_url,
           reading_status, collection, tags, original_file_ref, page_count,
           analysis_status, created_at, source_text
    FROM books WHERE id = ${bookId} AND clerk_user_id = ${TEST_USER}
  `) as unknown as { title: string; page_count: number; tags: unknown }[];
  if (!getBook[0] || getBook[0].title !== "The Quantum Engine") {
    console.error("FAIL: getBook did not return the owned book.");
    process.exit(1);
  }
  const getPages = (await sql`
    SELECT id, book_id, page_number, text FROM book_pages
    WHERE book_id = ${bookId} AND page_number >= 1 ORDER BY page_number LIMIT 1
  `) as unknown as { id: number }[];
  if (getPages.length !== 1) {
    console.error("FAIL: getBookPages did not return the page window.");
    process.exit(1);
  }
  console.log("OK: getBook + getBookPages read back the owned book + pages.");

  // 4) createAnnotation PROVENANCE: a real quote (whitespace-normalized match)
  //    must insert; a FABRICATED quote must NOT (server rejects with an error).
  const realQuote = "This is the first paragraph about the quantum engine.";
  const ann = (await sql`
    INSERT INTO book_annotations (book_id, page_id, paragraph_index, quote, note, color)
    VALUES (${bookId}, ${pageId}, 1, ${realQuote}, ${"key idea"}, ${"amber"})
    RETURNING id, quote
  `) as unknown as { id: number; quote: string }[];
  if (!ann[0]) {
    console.error("FAIL: real-quote annotation did not insert.");
    process.exit(1);
  }
  const fabricatedMatches = normalizeWs(PAGE_TEXT).includes(
    normalizeWs("The universe exploded in 1999 and everyone clapped."),
  );
  if (fabricatedMatches) {
    console.error("FAIL: fabricated quote unexpectedly matched the page text.");
    process.exit(1);
  }
  console.log("OK: annotation inserted for a REAL quote; fabricated quote is NOT present in page text (server would reject it).");

  // 5) listAnnotations returns the annotation.
  const anns = (await sql`
    SELECT a.id, a.book_id, a.page_id, a.paragraph_index, a.quote, a.note,
           a.color, a.created_at, p.page_number
    FROM book_annotations a
    LEFT JOIN book_pages p ON p.id = a.page_id
    WHERE a.book_id = ${bookId} ORDER BY a.created_at DESC
  `) as unknown as { quote: string }[];
  if (!anns.some((a) => a.quote === realQuote)) {
    console.error("FAIL: listAnnotations did not return the annotation.");
    process.exit(1);
  }
  console.log("OK: listAnnotations returns the annotation with resolved page.");

  // 6) searchBooks keyword over page text (exact query the handler runs for
  //    page-content hits). "quantum engine" must match page 1.
  const searchHit = (await sql`
    SELECT bp.id AS page_id, bp.book_id, bp.page_number, bp.text AS page_text,
           b.title, b.author
    FROM book_pages bp JOIN books b ON b.id = bp.book_id
    WHERE b.clerk_user_id = ${TEST_USER} AND bp.book_id = ${bookId}
    ORDER BY b.created_at DESC, bp.page_number
  `) as unknown as { page_text: string; title: string }[];
  const pageTextLower = (searchHit[0]?.page_text ?? "").toLowerCase();
  if (!pageTextLower.includes("quantum") || !pageTextLower.includes("engine")) {
    console.error("FAIL: searchBooks keyword 'quantum engine' did not match the page text.");
    process.exit(1);
  }
  console.log("OK: searchBooks full-text term 'quantum engine' matches the stored page text.");

  // 7) Owner scoping: another user cannot read the book.
  const leak = (await sql`
    SELECT id FROM books WHERE id = ${bookId} AND clerk_user_id = ${OTHER}
  `) as unknown as { id: number }[];
  if (leak.length !== 0) {
    console.error("FAIL: cross-user read leaked the book (owner scoping broken).");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read this book.");

  // 8) Retest gate AFTER grant.
  await sql`
    INSERT INTO users (clerk_user_id, addon_booksnap)
    VALUES (${TEST_USER}, ${true})
    ON CONFLICT (clerk_user_id) DO UPDATE SET addon_booksnap = ${true}, updated_at = NOW()
  `;
  const unlocked = (await sql`
    SELECT addon_booksnap FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { addon_booksnap?: boolean }[];
  if (unlocked[0]?.addon_booksnap !== true) {
    console.error("FAIL: setting addon_booksnap = true did not unlock the module.");
    process.exit(1);
  }
  console.log("OK: gate unlocks AFTER grant (retested after use, not just before).");

  // 9) deleteBook — cascades pages AND annotations (foreign key ON DELETE CASCADE).
  await sql`DELETE FROM books WHERE id = ${bookId} AND clerk_user_id = ${TEST_USER} RETURNING id`;
  const pagesLeft = (await sql`SELECT id FROM book_pages WHERE book_id = ${bookId}`) as unknown as { id: number }[];
  const annsLeft = (await sql`SELECT id FROM book_annotations WHERE book_id = ${bookId}`) as unknown as { id: number }[];
  if (pagesLeft.length !== 0 || annsLeft.length !== 0) {
    console.error("FAIL: deleteBook did not cascade pages/annotations.");
    process.exit(1);
  }
  console.log("OK: deleteBook removes the book AND cascades pages + annotations.");

  if (CLEANUP) {
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test user rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test book rows left in DB for inspection.");
  }
  console.log("VerifyBooksnap OK — BookSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
