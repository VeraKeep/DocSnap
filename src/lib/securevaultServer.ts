/**
 * Server-side SecureVault client.
 *
 * This is the ONLY place (besides the api route itself) that talks to
 * SecureVault with a user's stored token. It is imported by the
 * `-securevault` API route (mounted in serve.ts and vercel-entry.ts) — never
 * by browser code. The SecureVault token stays server-side.
 *
 * Contract implemented: `POST /v1/ingest` (see
 * ../SecureVault/docs/ingestion-api.md). We forward a document with
 * `source=docsnap` + a `source_ref` we generate, using the user's stored
 * SecureVault bearer token. SecureVault stores the document in *that user's*
 * vault and returns a SecureVault `document_id`, which we hand back to the
 * DocSnap client so it can link to the vault.
 *
 * The SecureVault base URL is NOT hardcoded: it is read from the
 * `SECUREVAULT_API_URL` env var so each environment can point at the
 * appropriate SecureVault host (dev preview, staging, prod). When it is not
 * configured the feature reports itself unavailable (503) rather than guessing
 * a host.
 */
import type { SecureVaultConnection } from "../db/securevaultConnection";

/** Result shape of `POST /v1/ingest`. */
export interface SecureVaultIngestResult {
  document_id: string;
  status: {
    uploaded: boolean;
    hash: string;
    ocr_status: string | null;
    ai_status: string | null;
    created_at: string;
    file_name: string;
    size_bytes: number;
    source: string | null;
    source_ref: string | null;
  };
}

/**
 * The SecureVault API base URL, from env. Returns null when unconfigured so
 * callers can report "SecureVault not configured" instead of guessing a host.
 */
export function secureVaultApiUrl(): string | null {
  const url = process.env.SECUREVAULT_API_URL;
  return url && url.trim().length > 0 ? url.trim().replace(/\/+$/, "") : null;
}

/**
 * Forward a document to SecureVault's `POST /v1/ingest` on behalf of the
 * connected user.
 *
 * @param conn        The stored connection (holds the SecureVault bearer token).
 * @param file        The document bytes.
 * @param fileName    Filename used as the vault's `file_name`.
 * @param opts        Optional metadata passed through to the vault.
 *
 * Returns the SecureVault `{ document_id, status }` on success.
 * Throws an Error whose `status` field carries the SecureVault HTTP status so
 * the route can map it to a clean client error.
 */
export async function forwardToSecureVaultIngest(
  conn: SecureVaultConnection,
  file: Blob,
  fileName: string,
  opts: {
    source?: string;
    sourceRef?: string;
    title?: string;
    description?: string;
    category?: string;
    type?: string;
    tags?: string[];
  } = {},
): Promise<SecureVaultIngestResult> {
  const base = secureVaultApiUrl();
  if (!base) {
    throw httpError(
      503,
      "SECUREVAULT_API_URL is not configured — SecureVault integration is unavailable.",
    );
  }

  const form = new FormData();
  form.append("file", new Blob([file], { type: file.type || "application/pdf" }), fileName);
  form.append("source", opts.source ? opts.source.toLowerCase() : "docsnap");
  form.append("source_ref", opts.sourceRef ?? generateSourceRef());
  if (opts.title) form.append("title", opts.title);
  if (opts.description) form.append("description", opts.description);
  if (opts.category) form.append("category", opts.category);
  if (opts.type) form.append("type", opts.type);
  if (opts.tags?.length) form.append("tags", opts.tags.join(","));

  let res: Response;
  try {
    res = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.accessToken}` },
      body: form,
    });
  } catch (err) {
    console.error("[securevault] ingest network failure", err);
    throw httpError(
      502,
      "Could not reach SecureVault. Please try again in a moment.",
    );
  }

  const body = (await res.json().catch(() => ({}))) as Partial<SecureVaultIngestResult> & {
    message?: string;
  };

  if (!res.ok) {
    // Map SecureVault's auth failure to a "reconnect needed" signal.
    if (res.status === 401) {
      throw httpError(
        401,
        body.message ?? "Your SecureVault connection is invalid or expired. Reconnect your vault.",
        "securevault_token_invalid",
      );
    }
    throw httpError(
      res.status >= 500 ? 502 : res.status,
      body.message ?? `SecureVault rejected the document (HTTP ${res.status}).`,
    );
  }

  if (!body.document_id) {
    throw httpError(502, "SecureVault returned no document_id.");
  }
  return body as SecureVaultIngestResult;
}

/** Generate a DocSnap `source_ref`: `ds-YYYYMMDD-<random>` (≤200 chars). */
export function generateSourceRef(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `ds-${date}-${rand}`;
}

/** An Error that also carries an HTTP status + optional machine code. */
export interface SecureVaultHttpError extends Error {
  status: number;
  code?: string;
}

function httpError(status: number, message: string, code?: string): SecureVaultHttpError {
  const err = new Error(message) as SecureVaultHttpError;
  err.status = status;
  err.code = code;
  return err;
}

export function isHttpError(err: unknown): err is SecureVaultHttpError {
  return err instanceof Error && typeof (err as SecureVaultHttpError).status === "number";
}
