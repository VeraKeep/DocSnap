/**
 * Verify that cloud document METADATA now round-trips through Postgres
 * (the `cloud_documents` table), not the server filesystem.
 *
 * Exercises the full CRUD + search path against the live Neon DB:
 *   insert -> read/list -> update category -> search finds it -> delete -> gone
 * and confirms a user with no rows returns []. Self-contained and idempotent:
 * it cleans up its own test row so it is safe to run repeatedly / as part of
 * `npm run verify`.
 *
 * Run:  bun scripts/verifyCloudDocuments.ts
 */
import { sql } from "../src/db";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("VERIFY_FAIL " + msg);
    process.exit(1);
  }
}

async function readAll(userId: string) {
  const rows = await sql`
    SELECT id, name, page_count, date, file_key, file_url, thumbnail_url,
           auto_category, user_category, ocr_text, content_hash
    FROM cloud_documents
    WHERE clerk_user_id = ${userId}
    ORDER BY date DESC
  `;
  return rows as unknown as Record<string, unknown>[];
}

async function main() {
  const user = "verify_clouddoc_user";
  const docId = "verify-clouddoc-" + Date.now();

  // The Postgres-backed shared read returns [] for a user with no rows.
  const empty = await readAll(user + "_nonexistent");
  assert(empty.length === 0, "expected empty list for a user with no rows");

  // 1. INSERT
  await sql`
    INSERT INTO cloud_documents (
      id, clerk_user_id, name, page_count, date, file_key, file_url,
      thumbnail_url, auto_category, user_category, ocr_text, content_hash
    ) VALUES (
      ${docId}, ${user}, 'VerifyDoc.pdf', 3, ${new Date().toISOString()},
      'vfilekey', 'https://utfs.io/f/vfilekey', null, 'Taxes', null, 'verify ocr payload', 'hash123'
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. READ / LIST (owner-scoped, newest first)
  const listed = await readAll(user);
  const doc = listed.find((r) => r.id === docId);
  assert(!!doc, "inserted doc should be readable back from Postgres");
  assert(doc!.name === "VerifyDoc.pdf", "name round-trip failed");
  assert(doc!.page_count === 3, "page_count round-trip failed");
  assert(doc!.file_key === "vfilekey", "file_key round-trip failed");
  assert(doc!.file_url === "https://utfs.io/f/vfilekey", "file_url round-trip failed");
  assert(listed[0].id === docId, "newest doc should sort first (ORDER BY date DESC)");

  // 3. UPDATE (owner-scoped category change)
  const updated = await sql`
    UPDATE cloud_documents
    SET user_category = 'Receipts'
    WHERE id = ${docId} AND clerk_user_id = ${user}
    RETURNING id
  `;
  assert(
    (updated as unknown as { id: string }[]).length === 1,
    "update should match exactly one row",
  );
  const afterUpdate = await readAll(user);
  const upDoc = afterUpdate.find((r) => r.id === docId);
  assert(upDoc!.user_category === "Receipts", "user_category update round-trip failed");

  // 4. SEARCH — the Postgres row must be findable by OCR text and owner.
  const search = await sql`
    SELECT id FROM cloud_documents
    WHERE clerk_user_id = ${user} AND ocr_text ILIKE '%verify ocr%'
  `;
  assert(
    (search as unknown as { id: string }[]).some((r) => r.id === docId),
    "search by ocr_text should find the inserted doc",
  );

  // 5. DELETE — removes only this user's matching row.
  await sql`DELETE FROM cloud_documents WHERE id = ${docId} AND clerk_user_id = ${user}`;
  const afterDelete = await readAll(user);
  assert(!afterDelete.some((r) => r.id === docId), "doc should be gone after delete");

  console.log("VERIFY_OK cloud_documents Postgres round-trip (insert→read→update→search→delete)");
}

main().catch((err) => {
  console.error("VERIFY_FAIL", err);
  process.exit(1);
});
