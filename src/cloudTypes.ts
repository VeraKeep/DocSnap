/**
 * Client-safe document types and category helpers for DocSnap.
 *
 * This module is safe to import from browser code: it contains NO Node-only
 * imports and NO module-scope code that touches `process`, `fs`, `path`, or
 * UploadThing. Client components import `CloudDocument` / `DocCategory` /
 * `ALL_CATEGORIES` / `getDocCategory` from here instead of from
 * `src/cloudStorage.ts`, which is server-heavy (its module scope evaluates
 * `path.join(process.cwd(), "data")` and bundles `node:fs` / `node:path` /
 * `uploadthing/server` — that crashes the browser with "process is not
 * defined" on cold page loads).
 */

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
  /** Lightweight image/content hash used for duplicate detection */
  contentHash?: string;
  /** Number of other documents sharing this document's hash */
  duplicateCount?: number;
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
