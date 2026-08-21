/**
 * BillSnap module — owner-scoped server functions.
 *
 * Every bill is personal data scoped to exactly one Clerk user. The owner
 * identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); any caller-supplied owner ID is ignored. All
 * queries filter by the server-resolved owner, so no cross-user reads or
 * leaks are possible.
 *
 * Uses DocSnap's shared Neon connection helper (`~/db`) and the host schema
 * (src/db-schema.sql).
 *
 * MVP entitlement note: BillSnap pricing is not set yet (business plan —
 * "pricing to be set once the MVP is validated"), so the module is NOT
 * hard-gated behind a paid add-on in this prototype. Any signed-in user can
 * use `/bills` so the core loop is demonstrable. When the lead locks pricing,
 * gate this module with a `billsnap` add-on flag exactly like ReceiptSnap's
 * `requireReceiptSnapAddon` (see src/features/receiptsnap/server.ts and the
 * reserved `users.addon_billsnap` column in src/db-schema.sql).
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import {
  type AutopayStatus,
  type Bill,
  type BillStatus,
  BILL_STATUSES,
} from "./types";

export const BILL_SAMPLE_DEMO_SERIES_LABEL = "Lumbee River EMC";

/** The demo series used to showcase change detection (clearly demo data). */
interface DemoBill {
  vendor: string;
  category: string;
  account_reference: string;
  statement_date: string;
  due_date: string;
  amount_due: number;
  billing_period: string;
  autopay_status: AutopayStatus;
  status: BillStatus;
}

function toBill(r: Record<string, unknown>): Bill {
  return {
    id: Number(r.id),
    vendor: (r.vendor as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    account_reference: (r.account_reference as string | null) ?? null,
    statement_date: (r.statement_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    amount_due: r.amount_due == null ? null : Number(r.amount_due),
    minimum_payment:
      r.minimum_payment == null ? null : Number(r.minimum_payment),
    billing_period: (r.billing_period as string | null) ?? null,
    status: (r.status as BillStatus) || "Upcoming",
    autopay_status: (r.autopay_status as AutopayStatus) || "Unknown",
    confidence_score: r.confidence_score == null ? null : Number(r.confidence_score),
    reminder_lead_days:
      r.reminder_lead_days == null ? null : Number(r.reminder_lead_days),
    created_at: String(r.created_at),
  };
}

function text(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* istanbul ignore next — small type guard used by validators */
function statusOf(v: unknown, fallback: BillStatus = "Upcoming"): BillStatus {
  return BILL_STATUSES.includes(v as BillStatus) ? (v as BillStatus) : fallback;
}

/** Image types the base64 vision API can read directly (mirrors ReceiptSnap). */
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
// ~20 MB decoded image (base64 is ~4/3 of the binary size).
const MAX_IMAGE_BASE64_LENGTH = 28_000_000;

/** Parses a JSON-ish string from the model, tolerating code fences / wrappers. */
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

/** Coerces the model's autopay answer into the canonical three-state enum. */
function autopayOf(v: unknown): AutopayStatus {
  if (v == null) return "Unknown";
  const s = String(v).trim().toLowerCase();
  if (s.includes("not")) return "Not Detected";
  if (/detect|auto.?pay|enrolled|yes/.test(s)) return "Detected";
  return "Unknown";
}

/** Structured fields returned by bill extraction (client pre-fills these). */
export interface BillExtraction {
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

/**
 * Reads a bill photo with OpenAI's vision API and returns the structured BillSnap
 * fields, ready to pre-fill the editable Confirm form. Mirrors ReceiptSnap's
 * `extract` (src/features/receiptsnap/server.ts) exactly: same endpoint, model,
 * temperature, and json_object response format. Throws a clear message when the
 * OPENAI_API_KEY isn't connected, and readable errors on non-OK responses or
 * unparseable output — the UI degrades to the manual form on any of these.
 */
async function extractBill(imageBase64: string, mimeType: string): Promise<BillExtraction> {
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
            "Extract bill payment data with careful visual reading. Return strict JSON only with fields: vendor, category, account_reference, statement_date, due_date, amount_due, minimum_payment, billing_period, autopay_status, confidence_score. autopay_status must be exactly one of 'Detected', 'Not Detected', or 'Unknown'. confidence_score is a number from 0 to 1. Copy values exactly as printed on the bill — especially the account reference (including any prefix and ending digits), statement/due dates, billing period, and money amounts (do not round or alter them). Use null when a value is unreadable or not present.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read every meaningful field from this bill image." },
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
    throw new Error(
      `Extraction failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}): ${reason.slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = cleanJson(body.choices?.[0]?.message?.content ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The bill could not be read as structured data.");
  }
  const p = parsed as Record<string, unknown>;
  return {
    vendor: text(p.vendor),
    category: text(p.category),
    account_reference: text(p.account_reference),
    statement_date: text(p.statement_date),
    due_date: text(p.due_date),
    amount_due: num(p.amount_due),
    minimum_payment: num(p.minimum_payment),
    billing_period: text(p.billing_period),
    autopay_status: autopayOf(p.autopay_status),
    confidence_score: num(p.confidence_score),
  };
}

/**
 * Server function the capture flow calls to extract a real bill photo. Restricts
 * input to the image types the base64 vision API reads directly (JPEG/PNG/WebP,
 * like ReceiptSnap). PDFs are not rasterized yet — they stay on the manual
 * editable path in the UI. Automatically sees OPENAI_API_KEY when the lead wires
 * it; without it the handler throws a clear "not connected" message and the UI
 * falls back to the empty editable form.
 */
export const extractBillFromImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { imageBase64?: unknown; mimeType?: unknown };
    if (typeof d.imageBase64 !== "string" || d.imageBase64.length === 0) {
      throw new Error("Please choose a bill image.");
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
  .handler(async (opts): Promise<BillExtraction> => {
    await requireServerFunctionUser();
    return extractBill(opts.data.imageBase64, opts.data.mimeType);
  });

/**
 * BillSnap entitlement/config for the signed-in user. This is the UI's gate
 * channel. For the MVP there is no paid add-on, so `hasAddon` is legacy-parity
 * true whenever storage is configured — the module is open to any signed-in
 * user so the prototype loop is demonstrable. Anonymous → 401 (fail closed).
 */
export const getBillsEntitlement = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; hasAddon: boolean }> => {
    await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false };
    return { configured: true, hasAddon: true };
  },
);

export const listBills = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  if (!process.env.DATABASE_URL) return { configured: false, bills: [] };
  const rows = (await sql`
    SELECT id, vendor, category, account_reference, statement_date, due_date,
           amount_due, minimum_payment, billing_period, status, autopay_status,
           confidence_score, reminder_lead_days, created_at
    FROM bills
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, bills: rows.map(toBill) };
});

/** Validated editable fields shared by create + update. */
function billFields(d: Record<string, unknown>): {
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
} {
  return {
    vendor: text(d.vendor),
    category: text(d.category),
    account_reference: text(d.account_reference),
    statement_date: text(d.statement_date),
    due_date: text(d.due_date),
    amount_due: num(d.amount_due),
    minimum_payment: num(d.minimum_payment),
    billing_period: text(d.billing_period),
    autopay_status: (d.autopay_status as AutopayStatus) || "Unknown",
    confidence_score: num(d.confidence_score),
  };
}

export const createBill = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    if (!text(d.vendor)) throw new Error("Vendor is required.");
    return d;
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const f = billFields(data as Record<string, unknown>);
    const rows = (await sql`
      INSERT INTO bills (
        clerk_user_id, vendor, category, account_reference, statement_date,
        due_date, amount_due, minimum_payment, billing_period, status,
        autopay_status, confidence_score
      ) VALUES (
        ${userId}, ${f.vendor}, ${f.category}, ${f.account_reference}, ${f.statement_date},
        ${f.due_date}, ${f.amount_due}, ${f.minimum_payment}, ${f.billing_period},
        'Upcoming', ${f.autopay_status}, ${f.confidence_score}
      )
      RETURNING id, vendor, category, account_reference, statement_date, due_date,
                amount_due, minimum_payment, billing_period, status, autopay_status,
                confidence_score, reminder_lead_days, created_at
    `) as Record<string, unknown>[];
    return { configured: true, bill: toBill(rows[0]) };
  });

export const updateBill = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; fields?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid bill id.");
    const fields = (d.fields ?? {}) as Record<string, unknown>;
    if (!text(fields.vendor)) throw new Error("Vendor is required.");
    return { id, fields };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const f = billFields(data.fields as Record<string, unknown>);
    const rows = (await sql`
      UPDATE bills SET
        vendor = ${f.vendor},
        category = ${f.category},
        account_reference = ${f.account_reference},
        statement_date = ${f.statement_date},
        due_date = ${f.due_date},
        amount_due = ${f.amount_due},
        minimum_payment = ${f.minimum_payment},
        billing_period = ${f.billing_period},
        autopay_status = ${f.autopay_status},
        confidence_score = ${f.confidence_score},
        status = CASE WHEN status = 'Paid' THEN 'Paid' ELSE 'Upcoming' END
      WHERE id = ${data.id} AND clerk_user_id = ${userId}
      RETURNING id, vendor, category, account_reference, statement_date, due_date,
                amount_due, minimum_payment, billing_period, status, autopay_status,
                confidence_score, reminder_lead_days, created_at
    `) as Record<string, unknown>[];
    if (!rows[0]) return { configured: true, bill: null };
    return { configured: true, bill: toBill(rows[0]) };
  });

export const setReminder = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; leadDays?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid bill id.");
    const leadDays = typeof d.leadDays === "number" ? d.leadDays : Number(d.leadDays);
    const allowed = [0, 1, 3, 7];
    if (!allowed.includes(leadDays)) {
      throw new Error("Reminder must be on the due date or 1, 3, or 7 days before.");
    }
    return { id, leadDays };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`
      UPDATE bills SET reminder_lead_days = ${data.leadDays}
      WHERE id = ${data.id} AND clerk_user_id = ${userId}
    `;
    return { configured: true, id: data.id, reminder_lead_days: data.leadDays };
  });

export const setStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown; status?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid bill id.");
    const status = statusOf(d.status);
    if (status !== "Paid" && status !== "Archived" && status !== "Upcoming") {
      throw new Error("Only Paid, Archived, or reopen (Upcoming) is allowed here.");
    }
    return { id, status };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE bills SET status = ${data.status}
      WHERE id = ${data.id} AND clerk_user_id = ${userId}
      RETURNING id
    `) as Record<string, unknown>[];
    return { configured: true, ok: rows.length > 0 };
  });

/**
 * Seeds the worked change-detection demo series (clearly labeled sample data)
 * so the headline smart feature is visible on the bill detail. Only ever
 * inserts into the acting user's own scope, never anyone else's.
 */
export const seedDemoSeries = createServerFn({ method: "POST" })
  .validator(() => ({ ok: true }))
  .handler(async () => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    // Three consecutive Lumbee River EMC electric bills rising to a +31%
    // month-over-month example between periods 02/2026 and 03/2026.
    const series: DemoBill[] = [
      {
        vendor: BILL_SAMPLE_DEMO_SERIES_LABEL,
        category: "Utilities",
        account_reference: "000004821",
        statement_date: "2026-01-21",
        due_date: "2026-02-06",
        amount_due: 82.15,
        billing_period: "01/2026",
        autopay_status: "Detected",
        status: "Paid",
      },
      {
        vendor: BILL_SAMPLE_DEMO_SERIES_LABEL,
        category: "Utilities",
        account_reference: "000004821",
        statement_date: "2026-02-20",
        due_date: "2026-03-08",
        amount_due: 102.48,
        billing_period: "02/2026",
        autopay_status: "Detected",
        status: "Upcoming",
      },
      {
        vendor: BILL_SAMPLE_DEMO_SERIES_LABEL,
        category: "Utilities",
        account_reference: "000004821",
        statement_date: "2026-03-21",
        due_date: "2026-04-06",
        amount_due: 134.28,
        billing_period: "03/2026",
        autopay_status: "Detected",
        status: "Upcoming",
      },
    ];
    for (const b of series) {
      await sql`
        INSERT INTO bills (clerk_user_id, vendor, category, account_reference,
          statement_date, due_date, amount_due, billing_period, status, autopay_status)
        VALUES (${userId}, ${b.vendor}, ${b.category}, ${b.account_reference},
          ${b.statement_date}, ${b.due_date}, ${b.amount_due}, ${b.billing_period},
          ${b.status}, ${b.autopay_status})
      `;
    }
    return { configured: true, seeded: series.length };
  });
