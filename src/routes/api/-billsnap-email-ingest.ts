/**
 * BillSnap email ingestion — HTTP ingress point.
 *
 * POST /api/billsnap-email-ingest
 *
 * Accepts a normalized email payload (bill as a JPG/PNG/WebP image attachment,
 * as PDF attachment, or as text in the body) and pushes it through the existing
 * BillSnap extraction + record creation (src/features/billsnap/emailIngest.ts,
 * which reuses src/features/billsnap/server.ts::extractBill /
 * extractBillFromText and the same `bills` table as interactive capture).
 * Bills are always written owner-scoped to `users.clerk_user_id`.
 *
 * AUTH: this endpoint is NOT a browser/Clerk-session route — it is a machine
 * endpoint for the future inbound-email TRANSPORT (see the README / transport
 * note below). It authenticates with a shared secret so it stays fail-closed:
 *
 *   Header:  `x-billsnap-ingest-secret: <secret>`
 *   Env var: `BILLSNAP_EMAIL_INGEST_SECRET`
 *   (fallback field: body.secret, for transports that can only sign the body)
 *
 * OWNERSHIP/TRANSPORT DEPENDENCY (documented, not yet wired): there is no live
 * mail provider yet. The caller (the future transport) is trusted infrastructure
 * that MUST hold the shared secret AND resolve which Clerk user an inbound
 * email maps to (e.g. a per-user inbound address token, or an authenticated
 * forwarding rule) before POSTing. We do not trust a browser; the shared secret
 * + the BillSnap add-on gate (only add-on owners can have bills written) bound
 * what a caller can do. When a mail provider is added (e.g. Postmark, SendGrid
 * Inbound Parse, Cloudflare Email Workers, an SMTP-to-HTTP bridge), it posts
 * here with the owner resolved by the receiving address.
 *
 * The endpoint never creates a bill for a non-owner (fails closed), never AIs
 * a non-owner, and on every path returns a structured JSON status the transport
 * can email back to the sender (so a bill is never silently dropped).
 *
 * Required env: BILLSNAP_EMAIL_INGEST_SECRET, DATABASE_URL (+ OPENAI_API_KEY
 * for auto-extraction; without it bills are saved as editable drafts).
 */
import { ingestBillFromEmail, type EmailIngestInput } from "~/features/billsnap/emailIngest";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.BILLSNAP_EMAIL_INGEST_SECRET;
  if (!expected) {
    return json(
      {
        ok: false,
        code: "ingest_not_configured",
        message: "BillSnap email ingestion isn't configured (BILLSNAP_EMAIL_INGEST_SECRET is not set).",
      },
      501,
    );
  }

  // Read the raw body once so we can (a) check the body-secret fallback and
  // (b) reuse the text for parsing.
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, code: "bad_request", message: "Could not read request body." }, 400);
  }

  const headerSecret = request.headers.get("x-billsnap-ingest-secret") ?? "";
  let bodySecret = "";
  let input: EmailIngestInput | undefined;
  try {
    const parsed = JSON.parse(raw || "{}") as EmailIngestInput & { secret?: string };
    bodySecret = typeof parsed.secret === "string" ? parsed.secret : "";
    input = parsed;
  } catch {
    return json({ ok: false, code: "bad_request", message: "Invalid JSON body." }, 400);
  }

  const provided = headerSecret || bodySecret;
  if (!provided || provided !== expected) {
    return json(
      { ok: false, code: "unauthorized", message: "Invalid ingest secret." },
      401,
    );
  }

  if (!input || !input.owner?.clerkUserId) {
    return json(
      { ok: false, code: "bad_request", message: "Missing owner.clerkUserId in payload." },
      400,
    );
  }

  // Always accepted once authentic: the structured result is what the transport
  // emails back to the sender, so a rejected/incomplete email is surfaced, not
  // dropped. 4xx here aborts only on bad auth/shape, never on bill content.
  try {
    const result = await ingestBillFromEmail(input);
    return json(result, result.ok ? 200 : 422);
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "BillSnap email ingestion failed.";
    return json({ ok: false, code: "ingest_failed", message }, 500);
  }
}

/** Handshake / description for operators and transport config. */
export async function GET(): Promise<Response> {
  return json({
    ok: true,
    endpoint: "POST /api/billsnap-email-ingest",
    accepts:
      "Email payload with a JPG/PNG/WebP image attachment, a PDF attachment, or bill text in the body.",
    auth: "x-billsnap-ingest-secret header (or body.secret) matching BILLSNAP_EMAIL_INGEST_SECRET.",
    transport:
      "No inbound mail provider is wired yet — a provider webhook or SMTP-to-HTTP bridge posts here with owner.clerkUserId resolved from the receiving address.",
  });
}
