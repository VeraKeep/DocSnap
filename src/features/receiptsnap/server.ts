/**
 * ReceiptSnap module — owner-scoped server functions.
 *
 * Every receipt is personal data scoped to exactly one Clerk user. The owner
 * identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); any caller-supplied owner ID is ignored. All
 * queries filter by the server-resolved owner, so no cross-user reads or
 * leaks are possible. Legacy demo rows (ACME TEST SUPPLY, Hometown Appliances)
 * have a NULL owner and are never returned to authenticated users.
 *
 * Uses DocSnap's shared Neon connection helper (`~/db`) and the host schema
 * (src/db-schema.sql). The waitlist stays public (marketing capture).
 */
import { createServerFn } from "@tanstack/react-start";
import { getStartContext } from "@tanstack/start-storage-context";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import { hasReceiptSnapAddon, setReceiptSnapAddon } from "~/subscription";
import { type ReceiptsEntitlement } from "./types";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Clear, honest message for users without the add-on. */
export const ADDON_LOCKED_MESSAGE =
  "ReceiptSnap is a paid add-on — purchase it to unlock.";
/** Machine-readable code the UI can use to render the locked/upgrade screen. */
export const ADDON_LOCKED_CODE = "receiptsnap_addon_required";

/**
 * HARD entitlement gate (business-plan rev 15). ReceiptSnap is a paid add-on,
 * NOT bundled into any DocSnap tier. Fails CLOSED with HTTP 403 for any
 * signed-in user who does not own the add-on — including every paid
 * (Personal/Household/Complete) subscriber. Anonymous callers are already
 * rejected with 401 by requireServerFunctionUser.
 */
async function requireReceiptSnapAddon(userId: string): Promise<void> {
  const owned = await hasReceiptSnapAddon(userId);
  if (!owned) {
    throw new Response(
      JSON.stringify({ error: ADDON_LOCKED_MESSAGE, code: ADDON_LOCKED_CODE }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Reads the acting request's `Authorization: Bearer <token>` header, used to
 * scope the admin grant/revoke server function. The acting identity always
 * comes from the verified Clerk session for normal features; this admin
 * channel is intentionally separate, secret-gated, and never user-facing.
 */
function adminTokenFromRequest(): string | null {
  const request = getStartContext({ throwIfNotFound: false })?.request as
    | Request
    | undefined;
  if (!request || typeof request.headers?.get !== "function") return null;
  const header = request.headers.get("authorization") ?? "";
  if (!header.trim()) return null;
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : header.trim();
}
// ~20 MB decoded image (base64 is ~4/3 of the binary size).
const MAX_IMAGE_BASE64_LENGTH = 28_000_000;

function cleanJson(text: string) {
  const stripped = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function text(v: unknown) {
  return typeof v === "string" ? v : v == null ? null : String(v);
}

function number(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function extract(imageBase64: string, mimeType: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Extraction isn't enabled yet — OPENAI_API_KEY is not connected.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract receipt data with careful visual reading. Return strict JSON only with merchant, store_address, date, time, subtotal, tax, total, currency, payment_method, receipt_number, items (array of name, quantity, unit_price, line_total, sku, model, serial), warranty_references (array), serial_numbers (array). Pay special attention to product model numbers, serial numbers, and any warranty/guarantee language anywhere on the receipt; copy those values exactly. Use null when unreadable and [] for unknown arrays.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read every meaningful field from this receipt image." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let reason = detail;
    try {
      const j = JSON.parse(detail);
      if (j?.error?.message) reason = j.error.message;
    } catch {
      /* keep raw body */
    }
    throw new Error(`Extraction failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}): ${reason.slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = cleanJson(body.choices?.[0]?.message?.content ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The receipt could not be read as structured data.");
  }
  const p = parsed as Record<string, unknown>;
  return {
    merchant: text(p.merchant),
    store_address: text(p.store_address),
    date: text(p.date),
    time: text(p.time),
    subtotal: number(p.subtotal),
    tax: number(p.tax),
    total: number(p.total),
    currency: text(p.currency) ?? "USD",
    payment_method: text(p.payment_method),
    receipt_number: text(p.receipt_number),
    items: Array.isArray(p.items) ? p.items : [],
    warranty_references: Array.isArray(p.warranty_references) ? p.warranty_references : [],
    serial_numbers: Array.isArray(p.serial_numbers) ? p.serial_numbers : [],
  };
}

/**
 * Wire shapes for the serialized API responses. `Json` is the JSONB payload
 * from the items/extra columns (arbitrary JSON produced by AI extraction); it
 * must stay `any` so TanStack Start's strict output-serializability check
 * accepts it — `unknown` is rejected by `ValidateSerializable`.
 */
type Json = any;

interface ReceiptSummary {
  id: number;
  merchant: string | null;
  store_date: string | null;
  total: number | null;
  currency: string | null;
  items: Json;
  extra: Json;
  /** Soft-delete flag. Archived receipts leave the default list but stay owned. */
  archived: boolean;
  created_at: string;
}

interface ReceiptDetail extends ReceiptSummary {
  image_base64: string | null;
  clerk_user_id: string | null;
}

/** Parses a boolean DB column (Postgres returns true/false). */
function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "t";
}

function toReceiptSummary(r: Record<string, unknown>): ReceiptSummary {
  return {
    id: Number(r.id),
    merchant: (r.merchant as string | null) ?? null,
    store_date: (r.store_date as string | null) ?? null,
    total: r.total == null ? null : Number(r.total),
    currency: (r.currency as string | null) ?? null,
    items: r.items as Json,
    extra: r.extra as Json,
    archived: toBool(r.archived),
    created_at: String(r.created_at),
  };
}

function toReceipt(r: Record<string, unknown>): ReceiptDetail {
  return {
    ...toReceiptSummary(r),
    image_base64: (r.image_base64 as string | null) ?? null,
    clerk_user_id: (r.clerk_user_id as string | null) ?? null,
  };
}

/**
 * Auth-contract proof: resolves the caller's Clerk user ID from the server
 * session, or fails closed with HTTP 401.
 */
export const whoAmI = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  return { userId };
});

/**
 * ReceiptSnap entitlement for the signed-in user. This is the UI's gate
 * channel (does not throw for a locked user — it reports the state). `hasAddon`
 * is true only when the user owns the add-on. Anonymous → 401 (fail closed).
 */
export const getReceiptsEntitlement = createServerFn({ method: "GET" }).handler(async (): Promise<ReceiptsEntitlement> => {
  const userId = await requireServerFunctionUser();
  if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false };
  const hasAddon = await hasReceiptSnapAddon(userId);
  return { configured: true, hasAddon };
});

/**
 * Admin-only grant/revoke of the ReceiptSnap add-on (owner/tests). Gated by the
 * `RECEIPTSNAP_ADMIN_TOKEN` env secret presented as `Authorization: Bearer`.
 * When that env is unset the endpoint is disabled (fail closed). This is a
 * private operational channel — never surfaced in any user-facing UI.
 */
export const adminSetReceiptSnapAddon = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { clerkUserId?: unknown; granted?: unknown };
    if (typeof d.clerkUserId !== "string" || d.clerkUserId.trim().length === 0) {
      throw new Error("clerkUserId is required.");
    }
    return { clerkUserId: d.clerkUserId.trim(), granted: d.granted !== false };
  })
  .handler(async ({ data }) => {
    const expected = process.env.RECEIPTSNAP_ADMIN_TOKEN;
    if (!expected) {
      throw new Response("Admin add-on grants are disabled on this instance.", { status: 403 });
    }
    const provided = adminTokenFromRequest();
    if (!provided || provided !== expected) {
      throw new Response("Unauthorized", { status: 403 });
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await setReceiptSnapAddon(data.clerkUserId, data.granted);
    return { ok: true, clerkUserId: data.clerkUserId, granted: data.granted };
  });

export const listReceipts = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireReceiptSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, receipts: [] };
  // Soft-delete: the DEFAULT list excludes archived receipts (archived = the
  // "removed from view" state). Archived rows stay owned + stored and are
  // restored by unarchiving or listing the archived view.
  const rows = (await sql`
    SELECT id, merchant, store_date, total, currency, items, extra, archived, created_at
    FROM receipts
    WHERE clerk_user_id = ${userId} AND archived = false
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, receipts: rows.map(toReceiptSummary) };
});

/** Archived-only view: returns receipts hidden from the default list so they
 *  remain searchable and restorable (soft-delete never destroys records). */
export const listArchivedReceipts = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireReceiptSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, receipts: [] };
  const rows = (await sql`
    SELECT id, merchant, store_date, total, currency, items, extra, archived, created_at
    FROM receipts
    WHERE clerk_user_id = ${userId} AND archived = true
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, receipts: rows.map(toReceiptSummary) };
});

export const searchReceipts = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { query?: unknown; archived?: unknown };
    if (typeof d.query !== "string" || d.query.trim().length === 0) {
      throw new Error("Enter a search term.");
    }
    return { query: d.query.trim().slice(0, 200), archived: d.archived === true };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) return { configured: false, receipts: [] };
    const q = `%${opts.data.query}%`;
    // Search is scoped to the same view (active/archived) as the list.
    const rows = (await sql`
      SELECT id, merchant, store_date, total, currency, items, extra, archived, created_at
      FROM receipts
      WHERE clerk_user_id = ${userId}
        AND archived = ${opts.data.archived}
        AND (merchant ILIKE ${q} OR CAST(items AS TEXT) ILIKE ${q} OR CAST(extra AS TEXT) ILIKE ${q})
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return { configured: true, receipts: rows.map(toReceiptSummary) };
  });

export const getReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid receipt id.");
    }
    return { id };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) return { configured: false, receipt: null };
    const rows = (await sql`
      SELECT * FROM receipts
      WHERE id = ${opts.data.id} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!rows[0]) return { configured: true, receipt: null };
    return { configured: true, receipt: toReceipt(rows[0]) };
  });

export const saveReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { imageBase64?: unknown; mimeType?: unknown };
    if (typeof d.imageBase64 !== "string" || d.imageBase64.length === 0) {
      throw new Error("Please choose a receipt image.");
    }
    if (d.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new Error("That image is too large. Please use a photo under 20 MB.");
    }
    const mimeType = typeof d.mimeType === "string" ? d.mimeType : "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error("Unsupported image type. Please use a JPEG, PNG, or WebP photo.");
    }
    return { imageBase64: d.imageBase64, mimeType };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    // HARD add-on gate: only add-on owners may save. This replaces the old
    // free "5 receipts/month" meter entirely — there is no count cap anymore;
    // ownership of the add-on is the ONLY thing that matters. Enforced before
    // extraction so a locked upload never spends AI credits or creates a row.
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const extracted = await extract(opts.data.imageBase64, opts.data.mimeType);
    const rows = (await sql`
      INSERT INTO receipts (clerk_user_id, merchant, store_date, total, currency, items, extra, image_base64)
      VALUES (${userId}, ${extracted.merchant}, ${extracted.date}, ${extracted.total}, ${extracted.currency},
              ${JSON.stringify(extracted.items)}::jsonb,
              ${JSON.stringify({ ...extracted, items: undefined })}::jsonb,
              ${opts.data.imageBase64})
      RETURNING id
    `) as Record<string, unknown>[];
    return { id: Number(rows[0].id), extracted };
    });

/** Coerces a user-provided tags value into a clean string array (or null). */
function tagsOf(v: unknown): string[] | null {
  if (v == null) return null;
  const raw = Array.isArray(v)
    ? v.map((x) => String(x))
    : String(v).split(/[,;]/);
  const cleaned = raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 50);
  return cleaned.length ? cleaned : null;
}

/** Coerces a free-text field to a trimmed string or null. */
function nullableText(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
}

/**
 * Edit a receipt's METADATA only — merchant, amount (total), date, category,
 * notes, and tags. The underlying scanned IMAGE is immutable: `image_base64`
 * is never read, updated, or replaced by this path (there is no way to swap
 * the image through edit). Category/notes/tags live in the `extra` JSONB so
 * they stay honest with the record and remain searchable (search already scans
 * extra). Owner-scoped + hard-gated like every other ReceiptSnap write. Fails
 * closed: returns null when the receipt doesn't belong to the caller.
 */
export const updateReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; fields?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid receipt id.");
    const f = (d.fields ?? {}) as Record<string, unknown>;
    // Validate numeric amount if present.
    if (f.total != null && f.total !== "" && !Number.isFinite(Number(f.total))) {
      throw new Error("Amount must be a number.");
    }
    return {
      id,
      merchant: nullableText(f.merchant, 200),
      store_date: nullableText(f.store_date, 100),
      total: f.total == null || f.total === "" ? null : Number(f.total),
      currency: nullableText(f.currency, 10) ?? "USD",
      category: nullableText(f.category, 100),
      notes: nullableText(f.notes, 2000),
      tags: tagsOf(f.tags),
    };
  })
  .handler(async ({ data }): Promise<{ configured: boolean; receipt: ReceiptDetail | null }> => {
    const userId = await requireServerFunctionUser();
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const f = data;
    // Merge ONLY the editable metadata keys into `extra` (category/notes/tags).
    // `items` and the extraction provenance keys are left untouched, and
    // `image_base64` is never referenced — the image is immutable.
    const extraPatch: Record<string, unknown> = {
      category: f.category,
      notes: f.notes,
      tags: f.tags,
    };
    const rows = (await sql`
      UPDATE receipts SET
        merchant = ${f.merchant},
        store_date = ${f.store_date},
        total = ${f.total},
        currency = ${f.currency},
        extra = extra || ${JSON.stringify(extraPatch)}::jsonb
      WHERE id = ${f.id} AND clerk_user_id = ${userId}
      RETURNING id, merchant, store_date, total, currency, items, extra, archived, image_base64, clerk_user_id, created_at
    `) as Record<string, unknown>[];
    if (!rows[0]) return { configured: true, receipt: null };
    return { configured: true, receipt: toReceipt(rows[0]) };
  });

/**
 * Soft-delete / ARCHIVE a receipt: flips `archived = true`, removing it from
 * the default list while keeping the row owned, stored, and searchable. This
 * is NOT a hard delete — the record and image are preserved and can be restored
 * via unarchiveReceipt. Protects the "every receipt, searchable forever"
 * promise and guards against accidental loss.
 */
export const archiveReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = typeof (data as { id?: unknown })?.id === "number"
      ? (data as { id: number }).id
      : Number((data as { id?: unknown })?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid receipt id.");
    return { id };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE receipts SET archived = true
      WHERE id = ${data.id} AND clerk_user_id = ${userId}
      RETURNING id
    `) as Record<string, unknown>[];
    if (!rows[0]) return { configured: true, ok: false };
    return { configured: true, ok: true, id: Number(rows[0].id) };
  });

/**
 * Unarchive (RESTORE) a receipt: flips `archived = false`, bringing it back to
 * the default list. Row + image were never deleted — this simply restores the
 * view state. Owner-scoped: another user cannot restore someone else's receipt.
 */
export const unarchiveReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = typeof (data as { id?: unknown })?.id === "number"
      ? (data as { id: number }).id
      : Number((data as { id?: unknown })?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid receipt id.");
    return { id };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireReceiptSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE receipts SET archived = false
      WHERE id = ${data.id} AND clerk_user_id = ${userId}
      RETURNING id
    `) as Record<string, unknown>[];
    if (!rows[0]) return { configured: true, ok: false };
    return { configured: true, ok: true, id: Number(rows[0].id) };
  });
