/**
 * Receipt image API — handled directly by serve.ts (the "-" prefix keeps this
 * out of TanStack Start's file router).
 *
 * Route:
 *   GET /api/receipts/:id/image
 *
 * Serves the stored receipt image for the signed-in owner. This is what the
 * ReceiptSnap → HomeSnap integration points an attached object document's
 * file_url at, so the receipt stays a single source of truth in the receipts
 * table instead of duplicating a heavy base64 string into object_documents.
 *
 * Auth: the owner id is derived server-side from the verified Clerk session
 * (`getVerifiedUserId`); the query is scoped to that owner, so a caller can
 * never read another user's receipt image.
 */
import { getVerifiedUserId } from "../../serverAuth";
import { sql } from "../../db";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(req: Request, rawId: string): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return notFound();
  if (!process.env.DATABASE_URL) return notFound();
  const rows = (await sql`
    SELECT image_base64 FROM receipts
    WHERE id = ${id} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  const base64 = rows[0]?.image_base64;
  if (typeof base64 !== "string" || base64.length === 0) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return notFound();
  }
  // Cast for cross-lib BufferSource typing; the underlying bytes are a plain
  // Uint8Array and are valid Response body input at runtime (Bun/Node both).
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
