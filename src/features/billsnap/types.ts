/**
 * BillSnap module — shared client types for the bills library UI.
 *
 * Mirrors the wire shapes returned by the feature's server functions
 * (src/features/billsnap/server.ts). A Bill is the structured record made from
 * a captured bill (photo/PDF or sample): vendor, due date, amount, payment
 * status, Autopay status and a reminder lead — the things the "snap the bill,
 * know what you owe and when" promise hangs on.
 */

/** Working payment-state buckets the library is filterable by. */
export type BillStatus = "Upcoming" | "Due Soon" | "Overdue" | "Paid" | "Archived";

/** Autopay state read from the bill (never stored/edited here). */
export type AutopayStatus = "Detected" | "Not Detected" | "Unknown";

export interface Bill {
  id: number;
  /** Who the bill is from (utility, insurer, lender, etc.). */
  vendor: string | null;
  /** High-level grouping, e.g. Utilities, Insurance, Home. */
  category: string | null;
  /** Account/statement reference, shown ending-only when sensitive. */
  account_reference: string | null;
  /** Statement date (free text as extracted/edited). */
  statement_date: string | null;
  /** Due date the payment must land by. */
  due_date: string | null;
  amount_due: number | null;
  /** Optional minimum payment for card-type bills. */
  minimum_payment: number | null;
  /** The service period this bill covers, e.g. "04/2026". */
  billing_period: string | null;
  status: BillStatus;
  autopay_status: AutopayStatus;
  /** 0..1 how confident extraction was; editable because humans know better. */
  confidence_score: number | null;
  /** Reminder lead: days before due_date (1, 3, 7) or 0 = on due date. */
  reminder_lead_days: number | null;
  created_at: string;
}

/** The editable extraction shape the Confirm step submits to create a Bill. */
export interface BillDraft {
  vendor: string;
  category: string;
  account_reference: string;
  statement_date: string;
  due_date: string;
  amount_due: string;
  minimum_payment: string;
  billing_period: string;
  autopay_status: AutopayStatus;
}

export const BILL_STATUSES: BillStatus[] = [
  "Upcoming",
  "Due Soon",
  "Overdue",
  "Paid",
  "Archived",
];

export const BILL_CATEGORIES = [
  "Utilities",
  "Insurance",
  "Home",
  "Healthcare",
  "Transportation",
  "Subscriptions",
  "Finance",
  "Other",
];

/** Render an amount with a currency symbol, tolerant of bad/empty values. */
export function formatAmount(amount: unknown): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/** Compact account number: only the last 4 digits are shown by default. */
export function maskAccount(reference: string | null): string {
  if (!reference) return "—";
  const digits = reference.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}

/**
 * A Bill is "due" enough to flag when it is due within `lead` days of today
 * (used to decide the Upcoming vs Due Soon / Overdue buckets).
 */
export function dueLabel(dueDate: string | null): string {
  return dueDate ? dueDate : "Date unavailable";
}
