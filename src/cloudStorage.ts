import { createServerFn } from "@tanstack/react-start";
import { UTApi } from "uploadthing/server";
import { getVerifiedUserId } from "./serverAuth";
import { sql } from "./db";
import type { CloudDocument } from "./cloudTypes";

// Re-export the client-safe document types/helpers so existing importers of
// this module keep working. Client code should import them from
// `~/cloudTypes` (this module is server-only: it evaluates Node APIs).
export type { CloudDocument, DocCategory } from "./cloudTypes";
export { ALL_CATEGORIES, getDocCategory } from "./cloudTypes";

/**
 * Cloud document metadata lives in Postgres (the `cloud_documents` table),
 * owner-scoped by `clerk_user_id`, NOT on the server filesystem. The previous
 * implementation persisted each user's docs to a local `data/<userId>.json`
 * file, which is not durable on Vercel/serverless (a deploy, cold start, or a
 * request landing on a different instance could lose or split the record).
 * Anything here must be readable from ANY instance, so reads/writes go
 * through the shared Neon DB via the `sql` tagged-template helper.
 */

// The `cloud_documents` table row shape (snake_case columns).
interface CloudDocumentRow {
  id: string;
  name: string;
  page_count: number;
  date: string;
  file_key: string;
  file_url: string;
  thumbnail_url: string | null;
  auto_category: string;
  user_category: string | null;
  ocr_text: string;
  content_hash: string;
}

/** Map a DB row back to the CloudDocument shape used across the app. */
function mapRowToDoc(row: CloudDocumentRow): CloudDocument {
  return {
    id: row.id,
    name: row.name,
    pageCount: row.page_count,
    date: row.date,
    fileKey: row.file_key,
    fileUrl: row.file_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    autoCategory: row.auto_category,
    userCategory: row.user_category ?? undefined,
    ocrText: row.ocr_text,
    contentHash: row.content_hash,
  };
}

/** Read a user's cloud documents from Postgres, newest first. */
async function readUserDocs(userId: string): Promise<CloudDocument[]> {
  const rows = (await sql`
    SELECT id, name, page_count, date, file_key, file_url, thumbnail_url,
           auto_category, user_category, ocr_text, content_hash
    FROM cloud_documents
    WHERE clerk_user_id = ${userId}
    ORDER BY date DESC
  `) as unknown as CloudDocumentRow[];
  return rows.map(mapRowToDoc);
}
/** Server-only helper: read a user's documents from Postgres.
 *  Safe to import from API route handlers (plain async function, no serverFn). */
export async function readUserDocuments(userId: string): Promise<CloudDocument[]> {
  return readUserDocs(userId);
}

/** Insert or replace a single cloud document row, keyed by the unique doc id. */
async function upsertDoc(userId: string, doc: CloudDocument): Promise<void> {
  await sql`
    INSERT INTO cloud_documents (
      id, clerk_user_id, name, page_count, date, file_key, file_url,
      thumbnail_url, auto_category, user_category, ocr_text, content_hash
    ) VALUES (
      ${doc.id}, ${userId}, ${doc.name}, ${doc.pageCount}, ${doc.date},
      ${doc.fileKey}, ${doc.fileUrl}, ${doc.thumbnailUrl ?? null},
      ${doc.autoCategory ?? ""}, ${doc.userCategory ?? null},
      ${doc.ocrText ?? ""}, ${doc.contentHash ?? ""}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      page_count = EXCLUDED.page_count,
      date = EXCLUDED.date,
      file_key = EXCLUDED.file_key,
      file_url = EXCLUDED.file_url,
      thumbnail_url = EXCLUDED.thumbnail_url,
      auto_category = EXCLUDED.auto_category,
      user_category = EXCLUDED.user_category,
      ocr_text = EXCLUDED.ocr_text,
      content_hash = EXCLUDED.content_hash
  `;
}

/** Check if cloud sync is configured (env vars present) */
export const isCloudConfigured = createServerFn().handler(async () => {
  return !!(
    process.env.UPLOADTHING_SECRET &&
    (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      process.env.CLERK_PUBLISHABLE_KEY)
  );
});

/** List all saved documents for a user.
 *  The userId validator arg is kept for client-call compatibility but is
 *  IGNORED — the real identity always comes from the verified Clerk session. */
export const listDocuments = createServerFn()
  .validator((userId: string) => userId)
  .handler(async () => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    return readUserDocs(userId);
  });

/** Add a document record after uploading to Uploadthing.
 *  `data.userId` is ignored in favor of the verified Clerk session id. */
export const addDocument = createServerFn()
  .validator(
    (doc: {
      userId: string;
      name: string;
      pageCount: number;
      fileKey: string;
      fileUrl: string;
      autoCategory?: string;
      ocrText?: string;
      contentHash?: string;
    }) => doc,
  )
  .handler(async ({ data }) => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    const newDoc: CloudDocument = {
      id: crypto.randomUUID(),
      name: data.name,
      pageCount: data.pageCount,
      date: new Date().toISOString(),
      fileKey: data.fileKey,
      fileUrl: data.fileUrl,
      autoCategory: data.autoCategory || "",
      ocrText: data.ocrText || "",
      contentHash: data.contentHash || "",
    };
    await upsertDoc(userId, newDoc);
    return newDoc;
  });

/** Update a document's user-set category.
 *  `data.userId` is ignored in favor of the verified Clerk session id. */
export const updateDocumentCategory = createServerFn()
  .validator(
    (params: {
      userId: string;
      docId: string;
      userCategory: string;
    }) => params,
  )
  .handler(async ({ data }) => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    const updated = await sql`
      UPDATE cloud_documents
      SET user_category = ${data.userCategory}
      WHERE id = ${data.docId} AND clerk_user_id = ${userId}
      RETURNING id
    `;
    if ((updated as unknown as { id: string }[]).length === 0) {
      throw new Error("Document not found");
    }
    return { success: true };
  });

/** Delete a document (both metadata and Uploadthing file).
 *  `data.userId` is ignored in favor of the verified Clerk session id. */
export const deleteDocument = createServerFn()
  .validator((params: { userId: string; docId: string }) => params)
  .handler(async ({ data }) => {
    const userId = await getVerifiedUserId();
    if (!userId) throw new Error("Not signed in");
    if (!process.env.UPLOADTHING_SECRET) {
      throw new Error("Uploadthing not configured");
    }

    // Resolve the doc (owner-scoped) to get its Uploadthing file key.
    const docs = await readUserDocs(userId);
    const doc = docs.find((d) => d.id === data.docId);
    if (!doc) {
      throw new Error("Document not found");
    }

    // Delete from Uploadthing
    try {
      const utapi = new UTApi({ token: process.env.UPLOADTHING_SECRET });
      await utapi.deleteFiles(doc.fileKey);
    } catch (err) {
      console.error("Failed to delete Uploadthing file:", err);
    }

    // Remove the metadata record from Postgres.
    await sql`
      DELETE FROM cloud_documents
      WHERE id = ${data.docId} AND clerk_user_id = ${userId}
    `;
    return { success: true };
  });
