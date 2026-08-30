/**
 * SecureVault integration API — the connected-identity bridge between DocSnap
 * (Clerk) and SecureVault (Supabase).
 *
 * The "-" prefix keeps this out of TanStack Start's file router; the routes are
 * mounted manually in BOTH serve.ts and vercel-entry.ts (see those files).
 *
 * Routes:
 *   POST   /api/securevault/connect   store a SecureVault token for the Clerk user (opt-in)
 *   GET    /api/securevault           connected? (never returns the token)
 *   DELETE /api/securevault           disconnect (delete the stored connection)
 *   POST   /api/securevault/ingest    forward a PDF blob to SecureVault `/v1/ingest`
 *
 * Identity: always derived SERVER-SIDE from the verified Clerk session
 * (`getVerifiedUserId(req)`). The multi-part ingest body carries only the PDF
 * blob + metadata — never a user identity — and never the SecureVault token.
 *
 * The SecureVault token lives only in Neon (see src/db/securevaultConnection.ts)
 * and is used here only to authorize the forwarded `/v1/ingest` call.
 */
import { getVerifiedUserId } from "../../serverAuth";
import {
  getConnection,
  saveConnection,
  deleteConnection,
  isConnectionExpired,
  type SecureVaultConnection,
} from "../../db/securevaultConnection";
import {
  forwardToSecureVaultIngest,
  isHttpError,
} from "../../lib/securevaultServer";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function authError(): Response {
  return json({ error: "Not signed in", code: "not_signed_in" }, 401);
}

// ---------------------------------------------------------------------------
// POST /api/securevault/connect
// ---------------------------------------------------------------------------
/**
 * Attach a SecureVault connection to the current Clerk user. Body fields:
 *   { accessToken: string, refreshToken?: string, expiresAt?: ISO string,
 *     vaultUserId?: string }
 * The browser obtains the token from SecureVault/Supabase (see the connect
 * modal) and sends it HERE once, to be stored server-side. It is never sent
 * back to the client afterwards.
 */
export async function POST_CONNECT(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) return authError();

  let body: {
    accessToken?: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
    vaultUserId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return json({ error: "accessToken is required" }, 400);
  }

  const ok = await saveConnection({
    clerkUserId: userId,
    accessToken,
    refreshToken: body.refreshToken ?? null,
    expiresAt: body.expiresAt ?? null,
    vaultUserId: body.vaultUserId ?? null,
  });
  if (!ok) {
    return json(
      { error: "Could not store the connection — database unavailable" },
      500,
    );
  }
  return json({ connected: true });
}

// ---------------------------------------------------------------------------
// GET /api/securevault
// ---------------------------------------------------------------------------
/** True when the current user has a stored SecureVault connection. */
export async function GET_STATUS(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) return authError();
  const conn = await getConnection(userId);
  return json({ connected: !!conn });
}

// ---------------------------------------------------------------------------
// DELETE /api/securevault
// ---------------------------------------------------------------------------
/** Disconnect: remove the stored SecureVault connection for the current user. */
export async function DELETE_DISCONNECT(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) return authError();
  await deleteConnection(userId);
  return json({ connected: false });
}

// ---------------------------------------------------------------------------
// POST /api/securevault/ingest
// ---------------------------------------------------------------------------
/**
 * Forward the scanned PDF to the user's SecureVault vault via `POST /v1/ingest`.
 * Multipart fields: `file` (required), plus optional `title`, `type`,
 * `category`, `tags`, `sourceRef`. We always send `source=docsnap` and a
 * generated `source_ref`. The response's `document_id` is the SecureVault id
 * the client stores to reference the document.
 */
export async function POST_INGEST(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) return authError();

  const conn: SecureVaultConnection | null = await getConnection(userId);
  if (!conn) {
    return json(
      { error: "No SecureVault connection — connect your vault first", code: "not_connected" },
      404,
    );
  }
  // Token expired and we have no way to refresh it -> tell the user to reconnect.
  if (isConnectionExpired(conn) && !conn.refreshToken) {
    return json(
      { error: "Your SecureVault connection has expired. Reconnect your vault.", code: "token_expired" },
      401,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart/form-data" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "file is required (multipart)" }, 400);
  }

  const title = form.get("title") ?? undefined;
  const type = form.get("type") ?? undefined;
  const category = form.get("category") ?? undefined;
  const tagsRaw = form.get("tags") ?? undefined;
  const sourceRef = form.get("sourceRef") ?? undefined;
  const tags = typeof tagsRaw === "string" && tagsRaw.trim().length
    ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6)
    : [];

  try {
    const result = await forwardToSecureVaultIngest(conn, file, file.name, {
      source: "docsnap",
      sourceRef: typeof sourceRef === "string" ? sourceRef : undefined,
      title: typeof title === "string" ? title : undefined,
      type: typeof type === "string" ? type : undefined,
      category: typeof category === "string" ? category : undefined,
      tags,
    });
    return json({ document_id: result.document_id, status: result.status });
  } catch (err) {
    if (isHttpError(err)) {
      if (err.status === 401) {
        return json(
          { error: err.message, code: err.code ?? "token_invalid" },
          401,
        );
      }
      return json({ error: err.message }, err.status === 503 ? 503 : 502);
    }
    console.error("[securevault] ingest failed", err);
    return json({ error: "Unexpected error while saving to vault" }, 500);
  }
}
