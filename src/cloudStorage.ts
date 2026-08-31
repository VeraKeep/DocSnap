import { createServerFn } from "@tanstack/react-start";
import { UTApi } from "uploadthing/server";
import fs from "node:fs";
import path from "node:path";
import { getVerifiedUserId } from "./serverAuth";
import type { CloudDocument } from "./cloudTypes";

// Re-export the client-safe document types/helpers so existing importers of
// this module keep working. Client code should import them from
// `~/cloudTypes` (this module is server-only: it evaluates Node APIs).
export type { CloudDocument, DocCategory } from "./cloudTypes";
export { ALL_CATEGORIES, getDocCategory } from "./cloudTypes";

/**
 * Server-only: resolve the per-user data directory. Deliberately lazy — this
 * module is imported by client bundles for its server functions, so any
 * module-scope Node evaluation (`path.join(process.cwd(), ...)`) would run in
 * the browser and throw "process is not defined" on cold page loads.
 */
function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

function ensureDataDir() {
  if (!fs.existsSync(getDataDir())) {
    fs.mkdirSync(getDataDir(), { recursive: true });
  }
}

function getUserDocPath(userId: string): string {
  return path.join(getDataDir(), `${userId}.json`);
}

function readUserDocs(userId: string): CloudDocument[] {
  ensureDataDir();
  const filePath = getUserDocPath(userId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CloudDocument[];
  } catch {
    return [];
  }
}
/** Server-only helper: read a user's documents directly from the data dir.
 *  Safe to import from API route handlers (plain function, no serverFn). */
export function readUserDocuments(userId: string): CloudDocument[] {
  return readUserDocs(userId);
}

function writeUserDocs(userId: string, docs: CloudDocument[]) {
  ensureDataDir();
  fs.writeFileSync(getUserDocPath(userId), JSON.stringify(docs, null, 2), "utf-8");
}

/** Check if cloud sync is configured (env vars present) */
export const isCloudConfigured = createServerFn().handler(async () => {
  return !!(process.env.UPLOADTHING_SECRET && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
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
    const docs = readUserDocs(userId);
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
    docs.unshift(newDoc);
    writeUserDocs(userId, docs);
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
    const docs = readUserDocs(userId);
    const doc = docs.find((d) => d.id === data.docId);
    if (!doc) throw new Error("Document not found");

    doc.userCategory = data.userCategory;
    writeUserDocs(userId, docs);
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

    const docs = readUserDocs(userId);
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

    // Remove from local metadata
    const updated = docs.filter((d) => d.id !== data.docId);
    writeUserDocs(userId, updated);
    return { success: true };
  });
