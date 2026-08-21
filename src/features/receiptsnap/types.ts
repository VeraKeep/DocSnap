/**
 * ReceiptSnap module — shared client types for the receipts library UI.
 *
 * Mirrors the wire shapes returned by the feature's server functions
 * (src/features/receiptsnap/server.ts). `items` and `extra` are arbitrary
 * JSON produced by AI extraction, so they are intentionally loosely typed
 * here; display helpers normalize unknown values for rendering.
 */

export interface ReceiptItem {
  name?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  line_total?: unknown;
  sku?: unknown;
  model?: unknown;
  serial?: unknown;
}

export interface ReceiptSummary {
  id: number;
  merchant: string | null;
  store_date: string | null;
  total: number | null;
  currency: string | null;
  items: unknown;
  extra: Record<string, unknown>;
  created_at: string;
}

export interface ReceiptDetail extends ReceiptSummary {
  image_base64: string | null;
  clerk_user_id: string | null;
}

/**
 * ReceiptSnap entitlement state for the signed-in user, resolved server-side
 * from the verified Clerk session (never from the client). Access to /receipts
 * is a HARD add-on gate (owner decision, rev 15) — there is no free monthly
 * allowance anymore and paid DocSnap tiers do NOT unlock ReceiptSnap. Only
 * `hasAddon === true` unlocks the library.
 */
export interface ReceiptsEntitlement {
  configured: boolean;
  /** True only when the user's record owns the ReceiptSnap add-on. */
  hasAddon: boolean;
}

/** Render a total with its currency. Tolerant of AI-extracted oddities. */
export function formatTotal(total: unknown, currency: unknown): string {
  const n = typeof total === "number" ? total : Number(total);
  if (!Number.isFinite(n)) return "Total unavailable";
  return `${currency || "USD"} ${n.toFixed(2)}`;
}

/**
 * Store dates are free text from AI extraction (e.g. "08/09/2026"); show them
 * as extracted rather than forcing a locale parse that may misread the format.
 */
export function displayDate(storeDate: string | null): string {
  return storeDate ? storeDate : "Date unavailable";
}

/** Normalize an arbitrary extracted value into display text, or null. */
export function displayText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => String(v)).join(", ") : null;
  }
  return String(value);
}
