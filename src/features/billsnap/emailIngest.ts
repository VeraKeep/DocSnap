/**
 * BillSnap — email ingestion pipeline (server-side).
 *
 * Turns an emailed bill (image JPG/PNG/WebP attachment, or bill text in the
 * email body, or a PDF attachment) into a confirmed `bills` record for a single
 * owner, reusing the SAME extraction and record shape as interactive capture in
 * BillLibrary (src/features/billsnap/server.ts). No parallel pipeline:
 *
 *   - Image attachments → `extractBill` (the exact vision path capture uses).
 *   - Body text          → `extractBillFromText` (same model/schema, text mode).
 *   - PDF attachments     → server-side rasterization of the client-side
 *     `pdfFirstPageToPng` helper is not available in this stack (see below), so
 *     a PDF email is still stored as an editable draft (never dropped) and the
 *     caller is told it needs the interactive capture flow (or that a real
 *     transport should convert the PDF to a PNG first).
 *
 * OWNERSHIP: bills created here are scoped to `users.clerk_user_id` exactly like
 * every module row. The owner id is resolved by the trusted transport layer
 * (the caller holds the shared ingress secret), never guessed or taken from an
 * untrusted client — see src/routes/api/-billsnap-email-ingest.ts.
 *
 * GRACEFUL FAILURE: every outcome returns a structured status. A bill is never
 * silently dropped: when extraction is unavailable or unreadable we still write
 * a best-effort editable draft (vendor from the subject/from header), which the
 * owner completes in the normal /bills flow. Nothing is written only when the
 * email is genuinely empty or the owner lacks the paid add-on.
 */
import { sql } from "~/db";
import { hasBillSnapAddon } from "~/subscription";
import {
  extractBill,
  extractBillFromText,
  type BillExtraction,
} from "./server";
import type { AutopayStatus } from "./types";

/** Image MIME types the vision API reads directly (mirrors server.ts). */
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** PDF MIME types (accepted, but see the transport note below). */
const PDF_MIME_TYPES = ["application/pdf"];
// ~20 MB decoded (base64 is ~4/3 of the binary size), mirrors server.ts.
const MAX_ATTACHMENT_BASE64_LENGTH = 28_000_000;

/** A single normalized attachment from an email payload. */
export interface EmailIngestAttachment {
  filename?: string;
  mimeType?: string;
  /** Raw bytes as a base64 string (sans any `data:...;base64,` prefix). */
  base64?: string;
}

/** Normalized, transport-agnostic inbound-email payload. */
export interface EmailIngestInput {
  /** Owner whose scope this bill belongs to (resolved by the transport). */
  owner: { clerkUserId: string };
  subject?: string;
  from?: string;
  /** Plain-text body of the email (used when no image/PDF attachment). */
  bodyText?: string;
  attachment?: EmailIngestAttachment;
}

/** A bill row as returned by the ingest (for the caller to report). */
export interface EmailIngestBill {
  id: number;
  vendor: string | null;
  category: string | null;
  account_reference: string | null;
  statement_date: string | null;
  due_date: string | null;
  amount_due: number | null;
  minimum_payment: number | null;
  billing_period: string | null;
  autopay_status: AutopayStatus;
  confidence_score: number | null;
}

export type EmailIngestCode =
  | "created"
  | "created_without_extraction"
  | "addon_required"
  | "empty_email"
  | "db_not_configured";

export interface EmailIngestResult {
  ok: boolean;
  code: EmailIngestCode;
  message: string;
  /** Extraction quality note shown to help the user / gateway debug. */
  extraction?: { available: boolean; note: string };
  bill?: EmailIngestBill;
}

/** Strips RE:/FWD:/FW: and surrounding cruft to guess a friendly vendor name. */
function vendorFromSubject(subject: string): string | null {
  const clean = subject
    .replace(/^(re|fwd?|aw|antwort)\s*:\s*/i, "")
    .replace(/\[.*?\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || null;
}

/** Best-effort vendor name derived from the From header's display/domain. */
function vendorFromFromHeader(from: string): string | null {
  const match = from.match(/^([^<@]+)@/);
  if (match) return match[1].replace(/[._-]+/g, " ").trim();
  const dom = from.match(/@([^.]+)/);
  if (dom) return dom[1].replace(/[._-]+/g, " ").trim();
  return null;
}

/** True when the attachment actually carries usable bytes that aren't a data URI. */
function usableBase64(b?: string): string | undefined {
  if (typeof b !== "string" || !b.trim()) return undefined;
  const value = b.includes(",") && b.startsWith("data:") ? b.split(",")[1] : b;
  return value && value.length > 0 ? value : undefined;
}

/**
 * Core ingestion. Resolves nothing on its own (the caller supplies the owner via
 * the secret-gated transport); returns a structured result on every path.
 */
export async function ingestBillFromEmail(
  input: EmailIngestInput,
): Promise<EmailIngestResult> {
  const ownerId = input?.owner?.clerkUserId;
  if (!ownerId) {
    return {
      ok: false,
      code: "empty_email",
      message: "No owner was provided for this email.",
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      code: "db_not_configured",
      message: "BillSnap storage isn't connected yet — DATABASE_URL is not set.",
    };
  }

  // Hard add-on gate before any AI spend, mirroring server.ts. Only owners who
  // purchased BillSnap can ingest (fails closed; no bill is written).
  const owned = await hasBillSnapAddon(ownerId);
  if (!owned) {
    return {
      ok: false,
      code: "addon_required",
      message:
        "This BillSnap account doesn't own the paid add-on, so the emailed bill was not saved.",
    };
  }

  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const from = typeof input.from === "string" ? input.from.trim() : "";
  const bodyText =
    typeof input.bodyText === "string" ? input.bodyText.trim() : "";
  const attachment = input.attachment ?? {};

  const mimeType = typeof attachment.mimeType === "string"
    ? attachment.mimeType.trim().toLowerCase()
    : "";
  const isImage = IMAGE_MIME_TYPES.includes(mimeType);
  const isPdf = PDF_MIME_TYPES.includes(mimeType) || /\.pdf$/i.test(attachment.filename ?? "");
  const base64 =
    attachment.base64 && attachment.base64.length > MAX_ATTACHMENT_BASE64_LENGTH
      ? undefined
      : usableBase64(attachment.base64);

  // There is genuinely nothing to work from → surface it, don't write a junk row.
  const hasContent =
    !!base64 || !!bodyText || isPdf || !!attachment.filename || !!subject || !!from;
  if (!hasContent) {
    return {
      ok: false,
      code: "empty_email",
      message: "The email had no bill attachment and no readable body.",
    };
  }

  // ----- Extraction: reuse the exact capture path ----------------------------
  let extracted: BillExtraction | null = null;
  let extractionNote = "";
  let extractionUnavailable = false;

  if (base64 && isImage) {
    try {
      // Same vision call as BillLibrary capture (photo is base64 image).
      extracted = await extractBill(base64, mimeType || "image/jpeg");
    } catch (error) {
      extractionUnavailable = true;
      extractionNote =
        error instanceof Error && error.message ? error.message : "Auto-extraction couldn't read this bill image.";
    }
  } else if (bodyText) {
    try {
      // Same model/schema, text mode — for bill text that lives in the body.
      extracted = await extractBillFromText(bodyText);
    } catch (error) {
      extractionUnavailable = true;
      extractionNote =
        error instanceof Error && error.message ? error.message : "Auto-extraction couldn't read this bill text.";
    }
  } else if (isPdf) {
    // Server-side PDF rasterization of the client-side pdf.ts helper needs a
    // native canvas (not available in this stack) — see the transport README.
    // We still store an editable draft (never dropped) so the owner can run it
    // through interactive capture, which rasterizes via pdf.ts.
    extractionUnavailable = true;
    extractionNote =
      "PDF attached — PDFs need the interactive capture flow (or transport-side PNG conversion) to auto-extract.";
  } else {
    // An attachment we can't auto-read (e.g. unsupported type) or just a header.
    extractionUnavailable = true;
    extractionNote =
      attachment.filename || base64
        ? "That attachment type can't be auto-read — saved as a draft to fill in."
        : "No bill image found — saved as a draft from the email header.";
  }

  // ----- Best-effort draft (a bill is never dropped) -------------------------
  const fallbackVendor =
    vendorFromSubject(subject) ?? (from ? vendorFromFromHeader(from) : null) ?? "Billed (email)";
  const vendor = (extracted?.vendor?.trim() || "") || fallbackVendor;

  const f = {
    vendor,
    category: extracted?.category ?? null,
    account_reference: extracted?.account_reference ?? null,
    statement_date: extracted?.statement_date ?? null,
    due_date: extracted?.due_date ?? null,
    amount_due: extracted?.amount_due ?? null,
    minimum_payment: extracted?.minimum_payment ?? null,
    billing_period: extracted?.billing_period ?? null,
    autopay_status: (extracted?.autopay_status as AutopayStatus) || "Unknown",
    confidence_score: extracted?.confidence_score ?? null,
  };

  const rows = (await sql`
    INSERT INTO bills (
      clerk_user_id, vendor, category, account_reference, statement_date,
      due_date, amount_due, minimum_payment, billing_period, status,
      autopay_status, confidence_score
    ) VALUES (
      ${ownerId}, ${f.vendor}, ${f.category}, ${f.account_reference}, ${f.statement_date},
      ${f.due_date}, ${f.amount_due}, ${f.minimum_payment}, ${f.billing_period},
      'Upcoming', ${f.autopay_status}, ${f.confidence_score}
    )
    RETURNING id, vendor, category, account_reference, statement_date, due_date,
              amount_due, minimum_payment, billing_period, autopay_status,
              confidence_score
  `) as Record<string, unknown>[];

  const bill: EmailIngestBill = {
    id: Number(rows[0]?.id),
    vendor: (rows[0]?.vendor as string | null) ?? f.vendor,
    category: (rows[0]?.category as string | null) ?? null,
    account_reference: (rows[0]?.account_reference as string | null) ?? null,
    statement_date: (rows[0]?.statement_date as string | null) ?? null,
    due_date: (rows[0]?.due_date as string | null) ?? null,
    amount_due: rows[0]?.amount_due == null ? null : Number(rows[0].amount_due),
    minimum_payment: rows[0]?.minimum_payment == null ? null : Number(rows[0].minimum_payment),
    billing_period: (rows[0]?.billing_period as string | null) ?? null,
    autopay_status: ((rows[0]?.autopay_status as AutopayStatus) || "Unknown"),
    confidence_score: rows[0]?.confidence_score == null ? null : Number(rows[0].confidence_score),
  };

  if (!extractionUnavailable) {
    return {
      ok: true,
      code: "created",
      message: `Bill from ${vendor} added to your tracker.`,
      extraction: {
        available: true,
        note: "Fields auto-extracted from the emailed bill — review them in BillSnap.",
      },
      bill,
    };
  }

  return {
    ok: true,
    code: "created_without_extraction",
    message: `Bill from ${vendor} added as a draft — open it in BillSnap to finish the details.`,
    extraction: { available: false, note: extractionNote },
    bill,
  };
}
