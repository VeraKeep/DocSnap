/**
 * Share links — time-limited, optionally password-protected document sharing.
 *
 * Stored in the `share_links` Postgres table (schema in src/db-schema.sql).
 * Passwords are hashed with SHA-256 (document-level security — not
 * account-level, so a simple hash is sufficient).
 */
import { sql } from "../db";

export interface ShareLink {
  id: string;
  documentId: string;
  ownerUserId: string;
  passwordHash: string | null;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
  revoked: boolean;
}

export interface NewShareLink {
  documentId: string;
  ownerUserId: string;
  passwordHash?: string | null;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Record<string, unknown>): ShareLink | null {
  if (!row.id) return null;
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    ownerUserId: String(row.owner_user_id),
    passwordHash: row.password_hash == null ? null : String(row.password_hash),
    expiresAt: toIso(row.expires_at),
    maxDownloads: row.max_downloads == null ? null : Number(row.max_downloads),
    downloadCount: Number(row.download_count ?? 0),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    revoked: Boolean(row.revoked),
  };
}

/** Create the share_links table if it doesn't exist (idempotent). */
export async function ensureShareLinksTable(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS share_links (
        id UUID PRIMARY KEY,
        document_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        password_hash TEXT,
        expires_at TIMESTAMPTZ,
        max_downloads INTEGER,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked BOOLEAN NOT NULL DEFAULT FALSE
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(owner_user_id)
    `;
  } catch (err) {
    console.error("[shareLinks] Failed to ensure table:", err);
  }
}

/** Hash a share password with SHA-256 (hex digest). */
export async function hashSharePassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison of two hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Create a new share link. Returns the stored row. */
export async function createShareLink(
  input: NewShareLink,
): Promise<ShareLink | null> {
  await ensureShareLinksTable();
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO share_links
      (id, document_id, owner_user_id, password_hash, expires_at, max_downloads)
    VALUES
      (${id}, ${input.documentId}, ${input.ownerUserId}, ${
        input.passwordHash ?? null
      }, ${input.expiresAt ?? null}, ${input.maxDownloads ?? null})
  `;
  return getShareLink(id);
}

/** Fetch a single share link by id (regardless of state). */
export async function getShareLink(
  id: string,
): Promise<ShareLink | null> {
  const rows = await sql`
    SELECT * FROM share_links WHERE id = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}

/** Atomically increment the download counter for a share link. */
export async function incrementDownload(id: string): Promise<void> {
  try {
    await sql`
      UPDATE share_links SET download_count = download_count + 1
      WHERE id = ${id}
    `;
  } catch (err) {
    console.error("[shareLinks] Failed to increment download:", err);
  }
}

/**
 * Revoke a share link. Only the owner can revoke; returns true when a row
 * was actually updated (i.e. the link exists and belongs to the owner).
 */
export async function revokeShareLink(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  try {
    const rows = await sql`
      UPDATE share_links SET revoked = TRUE
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      RETURNING id
    `;
    return rows.length > 0;
  } catch (err) {
    console.error("[shareLinks] Failed to revoke share link:", err);
    return false;
  }
}

/** List all share links owned by a user (newest first). */
export async function listShareLinks(
  ownerUserId: string,
): Promise<ShareLink[]> {
  const rows = await sql`
    SELECT * FROM share_links
    WHERE owner_user_id = ${ownerUserId}
    ORDER BY created_at DESC
  `;
  return rows
    .map(mapRow)
    .filter((r): r is ShareLink => r !== null);
}
