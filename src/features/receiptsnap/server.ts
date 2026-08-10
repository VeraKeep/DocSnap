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
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
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

function toReceiptSummary(r: Record<string, unknown>) {
  return {
    id: r.id,
    merchant: r.merchant,
    store_date: r.store_date,
    total: r.total == null ? null : Number(r.total),
    currency: r.currency,
    items: r.items,
    extra: r.extra,
    created_at: String(r.created_at),
  };
}

function toReceipt(r: Record<string, unknown>) {
  return {
    ...toReceiptSummary(r),
    image_base64: r.image_base64,
    clerk_user_id: r.clerk_user_id,
  };
}

/**
 * Auth-contract proof: resolves the caller's Clerk user ID from the server
 * session, or fails closed with HTTP 401.
 */
export const whoAmI = createServerFn({ method: "GET" }).handler(async (opts) => {
  const userId = await requireServerFunctionUser(opts.context);
  return { userId };
});

export const listReceipts = createServerFn({ method: "GET" }).handler(async (opts) => {
  const userId = await requireServerFunctionUser(opts.context);
  if (!process.env.DATABASE_URL) return { configured: false, receipts: [] };
  const rows = (await sql`
    SELECT id, merchant, store_date, total, currency, items, extra, created_at
    FROM receipts
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, receipts: rows.map(toReceiptSummary) };
});

export const searchReceipts = createServerFn({
  method: "POST",
  validator: (data: unknown) => {
    const d = (data ?? {}) as { query?: unknown };
    if (typeof d.query !== "string" || d.query.trim().length === 0) {
      throw new Error("Enter a search term.");
    }
    return { query: d.query.trim().slice(0, 200) };
  },
}).handler(async (opts) => {
  const userId = await requireServerFunctionUser(opts.context);
  if (!process.env.DATABASE_URL) return { configured: false, receipts: [] };
  const q = `%${opts.data.query}%`;
  const rows = (await sql`
    SELECT id, merchant, store_date, total, currency, items, extra, created_at
    FROM receipts
    WHERE clerk_user_id = ${userId}
      AND (merchant ILIKE ${q} OR CAST(items AS TEXT) ILIKE ${q} OR CAST(extra AS TEXT) ILIKE ${q})
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, receipts: rows.map(toReceiptSummary) };
});

export const getReceipt = createServerFn({
  method: "POST",
  validator: (data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid receipt id.");
    }
    return { id };
  },
}).handler(async (opts) => {
  const userId = await requireServerFunctionUser(opts.context);
  if (!process.env.DATABASE_URL) return { configured: false, receipt: null };
  const rows = (await sql`
    SELECT * FROM receipts
    WHERE id = ${opts.data.id} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  if (!rows[0]) return { configured: true, receipt: null };
  return { configured: true, receipt: toReceipt(rows[0]) };
});

export const saveReceipt = createServerFn({
  method: "POST",
  validator: (data: unknown) => {
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
  },
}).handler(async (opts) => {
  const userId = await requireServerFunctionUser(opts.context);
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
  return { id: rows[0].id, extracted };
});

export const joinWaitlist = createServerFn({
  method: "POST",
  validator: (data: unknown) => {
    const d = (data ?? {}) as { email?: unknown };
    if (typeof d.email !== "string" || d.email.trim().length === 0) {
      throw new Error("Enter an email address.");
    }
    return { email: d.email.trim().toLowerCase() };
  },
}).handler(async (opts) => {
  if (!process.env.DATABASE_URL) return { configured: false };
  await sql`INSERT INTO waitlist (email) VALUES (${opts.data.email}) ON CONFLICT (email) DO NOTHING`;
  return { configured: true };
});
