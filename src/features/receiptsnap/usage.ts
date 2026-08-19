/**
 * ReceiptSnap usage limits — shared server-side helper.
 *
 * Owner decision (2026-08-18): the free tier may save 5 receipts per calendar
 * month; paid tiers (Personal/Household/Complete — any tier where isPro is
 * true) are unlimited. This is enforced server-side on every save, so the cap
 * cannot be bypassed from the client, and the same helper powers the usage
 * meter on /receipts.
 *
 * The count is scoped to the user's own rows (clerk_user_id) in the current
 * calendar month, using the database clock so the boundary matches the
 * created_at default. Demo rows (NULL owner) belong to nobody and are never
 * counted for any user; if they were ever assigned to a real account they
 * would count like any other row — no special-casing.
 */
import { sql } from "~/db";
import { getUserSubscription } from "~/subscription";
import { FREE_RECEIPTS_PER_MONTH, RECEIPT_LIMIT_MESSAGE, type ReceiptsUsage } from "./types";

export { RECEIPT_LIMIT_MESSAGE, FREE_RECEIPTS_PER_MONTH };

/**
 * Computes the signed-in user's ReceiptSnap usage for the current calendar
 * month. `allowance` is 5 for the free tier and null (unlimited) for paid.
 */
export async function getReceiptsUsage(clerkUserId: string): Promise<ReceiptsUsage> {
  const subscription = await getUserSubscription(clerkUserId);
  const allowance = subscription.isPro ? null : FREE_RECEIPTS_PER_MONTH;
  const rows = (await sql`
    SELECT COUNT(*)::int AS used, to_char(date_trunc('month', NOW()), 'YYYY-MM') AS month
    FROM receipts
    WHERE clerk_user_id = ${clerkUserId}
      AND created_at >= date_trunc('month', NOW())
  `) as Record<string, unknown>[];
  const row = rows[0] as { used?: unknown; month?: unknown } | undefined;
  return {
    month: typeof row?.month === "string" ? row.month : "unknown",
    used: Number(row?.used ?? 0),
    allowance,
    tier: subscription.tier,
    isPro: subscription.isPro,
  };
}

/**
 * True when a free-tier user has already hit the monthly cap and must be
 * rejected. Paid users are never limited.
 */
export function isReceiptLimitReached(usage: ReceiptsUsage): boolean {
  return usage.allowance !== null && usage.used >= usage.allowance;
}
