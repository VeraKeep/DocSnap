/**
 * Share links API — handled directly by serve.ts (the "-" prefix keeps this
 * out of TanStack Start's file router).
 *
 * Routes:
 *   POST   /api/share        create a share link (Pro-only, requires auth)
 *   GET    /api/share/:id    access a shared document (public)
 *   DELETE /api/share/:id    revoke a share link (owner only)
 *   GET    /api/shares       list the authenticated user's share links
 *
 * Auth: the authenticated user id is derived server-side from the verified
 * Clerk session (`getVerifiedUserId(req)`). Client-supplied ids in headers,
 * body, or query are never trusted as the acting identity.
 */
import { getVerifiedUserId } from "../../serverAuth";
import { getUserSubscription } from "../../subscription";
import { readUserDocuments } from "../../cloudStorage";
import {
  createShareLink,
  getShareLink,
  incrementDownload,
  listShareLinks,
  revokeShareLink,
  hashSharePassword,
  timingSafeEqualHex,
} from "../../db/shareLinks";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function buildShareUrl(req: Request, id: string): string {
  const url = new URL(req.url);
  return `${url.origin}/share/${id}`;
}

function publicShape(link: {
  id: string;
  documentId: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
  revoked: boolean;
}) {
  return {
    id: link.id,
    documentId: link.documentId,
    expiresAt: link.expiresAt,
    maxDownloads: link.maxDownloads,
    downloadCount: link.downloadCount,
    createdAt: link.createdAt,
    revoked: link.revoked,
  };
}

// ---------------------------------------------------------------------------
// POST /api/share
// ---------------------------------------------------------------------------
export async function POST(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return json({ error: "Not signed in" }, 401);
  }
  // Pro gate.
  const sub = await getUserSubscription(userId);
  if (!sub.isPro) {
    return json(
      { error: "pro_required", message: "Secure sharing is a Pro feature" },
      403,
    );
  }
  // Parse body.
  let body: {
    documentId?: string;
    password?: string | null;
    expiresInHours?: number | null;
    maxDownloads?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const documentId = body.documentId;
  if (!documentId) {
    return json({ error: "documentId is required" }, 400);
  }
  // Document must exist and belong to the verified user.
  const docs = await readUserDocuments(userId);
  const doc = docs.find((d) => d.id === documentId);
  if (!doc) {
    return json({ error: "Document not found" }, 404);
  }
  // Expiration.
  let expiresAt: Date | null = null;
  const hours = Number(body.expiresInHours);
  if (Number.isFinite(hours) && hours > 0) {
    expiresAt = new Date(Date.now() + hours * 3600_000);
  }
  // Download limit.
  let maxDownloads: number | null = null;
  const limit = Number(body.maxDownloads);
  if (Number.isFinite(limit) && limit > 0) {
    maxDownloads = Math.floor(limit);
  }
  // Password.
  let passwordHash: string | null = null;
  if (body.password && body.password.length > 0) {
    passwordHash = await hashSharePassword(body.password);
  }
  const link = await createShareLink({
    documentId,
    ownerUserId: userId,
    passwordHash,
    expiresAt,
    maxDownloads,
  });
  if (!link) {
    return json(
      { error: "Failed to create share link — database unavailable" },
      500,
    );
  }
  return json(
    {
      url: buildShareUrl(req, link.id),
      id: link.id,
      expiresAt: link.expiresAt,
      maxDownloads: link.maxDownloads,
    },
    201,
  );
}

// ---------------------------------------------------------------------------
// GET /api/share/:id
// ---------------------------------------------------------------------------
export async function GET(
  req: Request,
  shareId: string,
): Promise<Response> {
  const link = await getShareLink(shareId);
  if (!link) {
    return json({ error: "Share link not found" }, 404);
  }
  if (link.revoked) {
    return json({ error: "This share link has been revoked" }, 410);
  }
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return json({ error: "This share link has expired" }, 410);
  }
  if (
    link.maxDownloads != null &&
    link.downloadCount >= link.maxDownloads
  ) {
    return json({ error: "This share link has reached its download limit" }, 410);
  }
  // Password check. The password is accepted ONLY via the Authorization
  // Basic header — never the URL query string, which would leak into browser
  // history, analytics, reverse-proxy logs, and referrer data.
  if (link.passwordHash) {
    const provided = extractBasicAuth(req);
    if (!provided) {
      return json(
        {
          error: "password_required",
          message: "This document is password protected",
        },
        401,
      );
    }
    const attemptHash = await hashSharePassword(provided);
    if (!timingSafeEqualHex(attemptHash, link.passwordHash)) {
      return json({ error: "Incorrect password" }, 401);
    }
  }
  // Resolve the underlying document.
  const docs = await readUserDocuments(link.ownerUserId);
  const doc = docs.find((d) => d.id === link.documentId);
  if (!doc) {
    return json({ error: "Shared document no longer exists" }, 410);
  }
  // All checks pass — count the access.
  await incrementDownload(link.id);
  return json({
    ...publicShape(link),
    name: doc.name,
    pageCount: doc.pageCount,
    fileUrl: doc.fileUrl,
    fileKey: doc.fileKey,
    date: doc.date,
  });
}

function extractBasicAuth(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return null;
  try {
    const decoded = atob(auth.slice(6));
    return decoded.split(":")[1] || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/share/:id
// ---------------------------------------------------------------------------
export async function DELETE(
  req: Request,
  shareId: string,
): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return json({ error: "Not signed in" }, 401);
  }
  const ok = await revokeShareLink(shareId, userId);
  if (!ok) {
    return json(
      { error: "Share link not found or you don't own it" },
      404,
    );
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/shares
// ---------------------------------------------------------------------------
export async function GET_LIST(req: Request): Promise<Response> {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return json({ error: "Not signed in" }, 401);
  }
  const links = await listShareLinks(userId);
  const now = Date.now();
  const active = links.map((l) => ({
    ...publicShape(l),
    url: buildShareUrl(req, l.id),
    // Convenience flags for the UI.
    expired:
      !!l.expiresAt && new Date(l.expiresAt).getTime() < now,
    reachedLimit:
      l.maxDownloads != null && l.downloadCount >= l.maxDownloads,
  }));
  return json({ links: active });
}
