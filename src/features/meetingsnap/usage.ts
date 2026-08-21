/**
 * MeetingSnap monthly usage meter.
 *
 * Mirrors how the (now-removed, PR #35) ReceiptSnap meter used to work: the
 * count is derived FROM audience data rather than a separate counter — we
 * count the user's meeting rows created since the start of the current month
 * (`created_at >= date_trunc('month', NOW())`) against the `meetings` table.
 * This is exact and cannot drift from what is actually stored.
 *
 * The resolver is fail-closed: if the users row is missing or the query
 * errors, the user is treated as Free (2/month) so a gate can never silently
 * grant paid access. The check is called BEFORE any OpenAI call so a blocked
 * Free user never burns AI credits.
 */
import { sql } from "~/db";
import { MEETING_TIERS, normalizeMeetingTier, type MeetingTier } from "./tiers";

export interface MeetingUsage {
  /** Meetings analyzed since the start of the current calendar month. */
  usedThisMonth: number;
  /** The user's tier's monthly allowance (Infinity = unlimited). */
  allowed: number;
  /** Resolved tier behind this usage (normalized, defaulting to free). */
  tier: MeetingTier;
}

/**
 * Load a user's meeting usage: their resolved MeetingSnap tier (from the
 * independent `users.meeting_subscription_status` column) plus a count of
 * meetings created this month.
 */
export async function getMeetingsUsage(
  clerkUserId: string,
): Promise<MeetingUsage> {
  // Resolve the user's own MeetingSnap tier first. Fails closed to free.
  let tier: MeetingTier = "free";
  try {
    const tierRows = (await sql`
      SELECT meeting_subscription_status FROM users
      WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `) as Record<string, unknown>[];
    tier = normalizeMeetingTier(
      tierRows[0]?.meeting_subscription_status as string | null | undefined,
    );
  } catch (err) {
    console.error("[meetingsnap] Failed to resolve meeting tier:", err);
  }

  // Count meetings created since the start of the current month.
  let usedThisMonth = 0;
  try {
    const countRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM meetings
      WHERE clerk_user_id = ${clerkUserId}
        AND created_at >= date_trunc('month', NOW())
    `) as Record<string, unknown>[];
    usedThisMonth = Number(countRows[0]?.count ?? 0);
  } catch (err) {
    console.error("[meetingsnap] Failed to count monthly meetings:", err);
  }

  return {
    usedThisMonth,
    allowed: MEETING_TIERS[tier].meetingsPerMonth,
    tier,
  };
}

/**
 * True when a user has already reached their current month's meeting cap and
 * must be blocked from further analysis. Unlimited tiers (Team → Infinity)
 * are never "reached".
 */
export function isMeetingLimitReached(usage: MeetingUsage): boolean {
  return usage.allowed !== Infinity && usage.usedThisMonth >= usage.allowed;
}
