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
  .validator((doc: { userId: string; name: string; pageCount: number; fileKey: string; fileUrl: string }) => doc)
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
    };
    docs.unshift(newDoc);
    writeUserDocs(data.userId, docs);
    return newDoc;
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
