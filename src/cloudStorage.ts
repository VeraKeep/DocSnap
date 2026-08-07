import { createServerFn } from "@tanstack/react-start";
import { UTApi } from "uploadthing/server";
import fs from "node:fs";
import path from "node:path";

export interface CloudDocument {
  id: string;
  name: string;
  pageCount: number;
  date: string;
  fileKey: string;
  fileUrl: string;
  thumbnailUrl?: string;
  /** Auto-detected category from OCR (empty string if no OCR was run) */
  autoCategory?: string;
  /** User-set category override. If set, this takes precedence over autoCategory */
  userCategory?: string;
  /** OCR-extracted full text for search (empty string if no OCR was run) */
  ocrText?: string;
}

export type DocCategory =
  | "Receipts"
  | "Insurance"
  | "Taxes"
  | "Medical"
  | "School"
  | "Military"
  | "Manuals"
  | "Uncategorized";

export const ALL_CATEGORIES: DocCategory[] = [
  "Receipts",
  "Insurance",
  "Taxes",
  "Medical",
  "School",
  "Military",
  "Manuals",
  "Uncategorized",
];

/** Get the effective display category for a document */
export function getDocCategory(doc: CloudDocument): DocCategory {
  const cat = doc.userCategory || doc.autoCategory;
  if (cat && ALL_CATEGORIES.includes(cat as DocCategory)) {
    return cat as DocCategory;
  }
  return "Uncategorized";
}

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getUserDocPath(userId: string): string {
  return path.join(DATA_DIR, `${userId}.json`);
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
  return !!(process.env.UPLOADTHING_SECRET && process.env.CLERK_PUBLISHABLE_KEY);
});

/** List all saved documents for a user (userId from Clerk client) */
export const listDocuments = createServerFn()
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    if (!userId) throw new Error("userId required");
    return readUserDocs(userId);
  });

/** Add a document record after uploading to Uploadthing */
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
    }) => doc,
  )
  .handler(async ({ data }) => {
    if (!data.userId) throw new Error("userId required");
    const docs = readUserDocs(data.userId);
    const newDoc: CloudDocument = {
      id: crypto.randomUUID(),
      name: data.name,
      pageCount: data.pageCount,
      date: new Date().toISOString(),
      fileKey: data.fileKey,
      fileUrl: data.fileUrl,
      autoCategory: data.autoCategory || "",
      ocrText: data.ocrText || "",
    };
    docs.unshift(newDoc);
    writeUserDocs(data.userId, docs);
    return newDoc;
  });

/** Update a document's user-set category */
export const updateDocumentCategory = createServerFn()
  .validator(
    (params: {
      userId: string;
      docId: string;
      userCategory: string;
    }) => params,
  )
  .handler(async ({ data }) => {
    if (!data.userId) throw new Error("userId required");
    const docs = readUserDocs(data.userId);
    const doc = docs.find((d) => d.id === data.docId);
    if (!doc) throw new Error("Document not found");

    doc.userCategory = data.userCategory;
    writeUserDocs(data.userId, docs);
    return { success: true };
  });

/** Delete a document (both metadata and Uploadthing file) */
export const deleteDocument = createServerFn()
  .validator((params: { userId: string; docId: string }) => params)
  .handler(async ({ data }) => {
    if (!data.userId) throw new Error("userId required");
    if (!process.env.UPLOADTHING_SECRET) {
      throw new Error("Uploadthing not configured");
    }

    const docs = readUserDocs(data.userId);
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
    writeUserDocs(data.userId, updated);
    return { success: true };
  });
