/**
 * BillSnap — inbound email provider webhook (Part B of the inbound transport).
 *
 * This is the transport-facing receiver: an inbound-parse provider (SendGrid
 * Inbound Parse primary; Postmark Inbound as a near-identical JSON variant)
 * POSTs a forwarded/filtered bill email here, and we normalize it into the
 * existing secret-gated ingest path (POST /api/billsnap-email-ingest →
 * ingestBillFromEmail). The route resolves the owner from the `to` recipient
 * via the per-user inbound token enrolled in Part A
 * (src/features/billsnap/inboundAddress.ts), so a forwarded bill always lands
 * in the right owner's scope without trusting the sender.
 *
 * AUTH (fail closed): this is a machine endpoint, not a Clerk-session route.
 *   - Secret: header `x-billsnap-inbound-secret`, OR query `?secret=`, OR
 *     form field `secret`, must equal BILLSNAP_INBOUND_SECRET (falls back to
 *     BILLSNAP_EMAIL_INGEST_SECRET so one shared secret gates both endpoints).
 *   - If no secret env var is set → 501. Wrong/missing secret → 401.
 *
 * PROVIDER FORMATS SUPPORTED (both normalize to the same EmailIngestInput):
 *   1. SendGrid Inbound Parse — multipart/form-data with fields `to`, `from`,
 *      `subject`, `text` (and `html`, `attachments`, ...) and each attachment
 *      as its own multipart file part (raw bytes, filename in
 *      Content-Disposition). Also accepts SendGrid's JSON shape.
 *   2. Postmark Inbound (legacy form posts) — JSON with `To`/`From`/`Subject`/
 *      `TextBody` and `Attachments: [{ Name, Content<base64>, ContentType }]`.
 *      Field names are matched case-insensitively, so either spelling works.
 *
 * OUTCOME CODES (never silently dropped): the provider emails the returned
 * status back to the original sender. Every parsed+resolved email returns HTTP
 * 200 with the same structured `{ ok, code, message, ... }` the ingest path
 * emits. 4xx is reserved for auth/shape failures the provider can't email back
 * meaningfully (and which it should not retry as spam).
 */
import { ingestBillFromEmail, type EmailIngestInput } from "~/features/billsnap/emailIngest";
import { resolveOwnerFromRecipient } from "~/features/billsnap/inboundAddress";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Resolve the configured webhook secret (inbound-specific, else the ingest one). */
function configuredSecret(): string {
  return process.env.BILLSNAP_INBOUND_SECRET ?? process.env.BILLSNAP_EMAIL_INGEST_SECRET ?? "";
}

function firstHeader(request: Request, name: string): string {
  return request.headers.get(name) ?? "";
}

/** Pick the single best attachment from the normalized list (image/pdf first). */
function pickAttachment(
  attachments: Array<{ filename?: string; mimeType?: string; base64?: string }>,
): EmailIngestInput["attachment"] {
  if (!attachments.length) return undefined;
  const image =
    attachments.find((a) =>
      ["image/jpeg", "image/png", "image/webp"].includes((a.mimeType ?? "").toLowerCase()),
    ) ||
    attachments.find((a) => /\.(jpe?g|png|webp)$/i.test(a.filename ?? ""));
  if (image) return image;
  const pdf =
    attachments.find((a) => (a.mimeType ?? "").toLowerCase() === "application/pdf") ||
    attachments.find((a) => /\.pdf$/i.test(a.filename ?? ""));
  if (pdf) return pdf;
  // No strongly-typed attachment: fall back to the first one and let the ingest
  // decide (unsupported types still become editable drafts — never dropped).
  return attachments[0];
}

/** Normalize one JSON attachment from any provider spelling. */
function normalizeJsonAttachment(a: Record<string, unknown>): {
  filename?: string;
  mimeType?: string;
  base64?: string;
} {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = a[k];
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };
  return {
    filename: get("filename", "Filename", "Name", "fileName"),
    mimeType: get("type", "mimeType", "ContentType", "contentType"),
    base64: get("content", "Content", "base64", "Base64", "data"),
  };
}

/** Normalize base64: strip any `data:<mime>;base64,` prefix defensively. */
function cleanBase64(value: string): string {
  const v = value.trim();
  const comma = v.indexOf(",");
  if (comma >= 0 && v.slice(0, comma).includes(";base64")) {
    return v.slice(comma + 1).trim();
  }
  return v;
}

/** Base64-encode raw attachment bytes from a multipart file part. */
async function filePartToAttachment(part: {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<{ filename?: string; mimeType?: string; base64?: string }> {
  const bytes = new Uint8Array(await part.arrayBuffer());
  return {
    filename: part.name || undefined,
    mimeType: part.type || undefined,
    base64: Buffer.from(bytes).toString("base64"),
  };
}

/** Parse a JSON webhook body into the normalized fields. */
function parseJsonBody(body: Record<string, unknown>): {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachments: Array<{ filename?: string; mimeType?: string; base64?: string }>;
} {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = body[k];
      if (typeof v === "string") return v;
    }
    return "";
  };
  let attachments: Array<Record<string, unknown>> = [];
  for (const k of ["attachments", "Attachments"]) {
    if (Array.isArray(body[k])) attachments = body[k] as Array<Record<string, unknown>>;
  }
  return {
    to: get("to", "To", "recipient", "Recipient"),
    from: get("from", "From", "sender", "Sender"),
    subject: get("subject", "Subject"),
    text: get("text", "Text", "TextBody", "textBody", "plain", "PlainBody"),
    attachments: attachments.map(normalizeJsonAttachment).filter((a): a is NonNullable<typeof a> => a != null),
  };
}

/**
 * Normalize a raw request body into the fields the ingest path needs. Handles
 * multipart/form-data (SendGrid Inbound Parse) and JSON (Postmark / SendGrid
 * JSON). Returns { status } for shape failures.
 */
async function normalizeRequest(
  request: Request,
): Promise<
  | { status: number; body: { ok: false; code: string; message: string } }
  | { status: null; body: { to: string; from: string; subject: string; text: string; attachments: EmailIngestInput["attachment"][] } }
> {
  const contentType = firstHeader(request, "content-type").toLowerCase();
  try {
    if (contentType.includes("multipart/form-data")) {
      const parts = await request.formData();
      let to = "";
      let from = "";
      let subject = "";
      let text = "";
      const attachments: EmailIngestInput["attachment"][] = [];
      for (const [key, value] of parts.entries()) {
        // A File-like part is an attachment (SendGrid names them attachment1..N);
        // a string part is a header/body field.
        if (typeof value === "string") {
          if (key.toLowerCase() === "to") to = value;
          else if (key.toLowerCase() === "from") from = value;
          else if (key.toLowerCase() === "subject") subject = value;
          else if (["text", "plain", "plainbody"].includes(key.toLowerCase())) text = value;
        } else {
          attachments.push(await filePartToAttachment(value as {
            name: string;
            type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
          }));
        }
      }
      return { status: null, body: { to, from, subject, text, attachments } };
    }

    // JSON body — Postmark default / SendGrid JSON / generic.
    const raw = await request.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {
        status: 400,
        body: { ok: false, code: "bad_request", message: "Invalid JSON body." },
      };
    }
    const normalized = parseJsonBody(parsed);
    const attachments: EmailIngestInput["attachment"][] = normalized.attachments;
    return {
      status: null,
      body: {
        to: normalized.to,
        from: normalized.from,
        subject: normalized.subject,
        text: normalized.text,
        attachments,
      },
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "bad_request",
        message: error instanceof Error ? error.message : "Could not parse the webhook body.",
      },
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  const expected = configuredSecret();
  if (!expected) {
    return json(
      {
        ok: false,
        code: "inbound_not_configured",
        message:
          "BillSnap inbound email isn't configured (set BILLSNAP_INBOUND_SECRET or BILLSNAP_EMAIL_INGEST_SECRET).",
      },
      501,
    );
  }

  // Auth: header, else query ?secret=, else form field `secret`. Matching the
  // ingest gate so one secret guards the whole ingestion surface.
  const headerSecret = firstHeader(request, "x-billsnap-inbound-secret");
  const querySecret = new URL(request.url).searchParams.get("secret") ?? "";
  let provided = headerSecret || querySecret;

  if (!provided) {
    // Some providers can only sign the body — check a `secret` form/JSON field.
    const contentType = firstHeader(request, "content-type").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      try {
        const parts = await request.formData();
        const field = parts.get("secret");
        if (typeof field === "string") provided = field;
      } catch {
        /* fall through to 401 */
      }
    } else {
      try {
        const raw = await request.text();
        const parsed = JSON.parse(raw || "{}") as { secret?: unknown };
        if (typeof parsed.secret === "string") provided = parsed.secret;
      } catch {
        /* fall through to 401 */
      }
    }
  }

  if (!provided || provided !== expected) {
    return json({ ok: false, code: "unauthorized", message: "Invalid inbound secret." }, 401);
  }

  const normalized = await normalizeRequest(request);
  if (normalized.status !== null) return json(normalized.body, normalized.status);

  const { to, from, subject, text, attachments } = normalized.body;

  if (!to) {
    return json(
      { ok: false, code: "bad_request", message: "Missing `to` recipient." },
      400,
    );
  }

  // ----- Owner resolution via the Part A token mapping (never trust sender) --
  const { clerkUserId, token, domain } = await resolveOwnerFromRecipient(to);
  if (!clerkUserId) {
    // The provider emails this back to the sender. It's not spam — it surfaces
    // that the address isn't enrolled, and nothing was silently dropped.
    return json(
      {
        ok: false,
        code: "unknown_recipient",
        message:
          token
            ? `The inbound address "${to}" isn't active for BillSnap email-in (token not enrolled/revoked).`
            : `"${to}" isn't a BillSnap inbound address — expecting bills+<token>@${domain ?? "inbound.docsnapapp.com"}.`,
      },
      200,
    );
  }

  const attachment = pickAttachment(attachments as { filename?: string; mimeType?: string; base64?: string }[]);
  if (attachment?.base64) attachment.base64 = cleanBase64(attachment.base64);

  const input: EmailIngestInput = {
    owner: { clerkUserId },
    subject: subject || undefined,
    from: from || undefined,
    bodyText: text || undefined,
    attachment,
  };

  try {
    const result = await ingestBillFromEmail(input);
    // HTTP 200 for every resolved outcome so the provider emails the status back
    // (no silent drop, no retry spam). Ingest never throws on content.
    return json(result, 200);
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "BillSnap inbound ingest failed.";
    return json({ ok: false, code: "ingest_failed", message }, 500);
  }
}

/** Handshake / describe for operators and provider config. */
export async function GET(): Promise<Response> {
  return json({
    ok: true,
    endpoint: "POST /api/billsnap-email-inbound",
    accepts:
      "SendGrid Inbound Parse (multipart/form-data or JSON) and Postmark Inbound (JSON) webhook payloads of a forwarded bill email.",
    auth: "x-billsnap-inbound-secret header (or ?secret= / body secret) matching BILLSNAP_INBOUND_SECRET (or BILLSNAP_EMAIL_INGEST_SECRET).",
    ownerResolution:
      "Resolves the owner from the `to` recipient's bills+<token>@inbound.docsnapapp.com address via the enrolled inbound token.",
    ingest: "Normalizes into the existing POST /api/billsnap-email-ingest path (ingestBillFromEmail).",
  });
}
