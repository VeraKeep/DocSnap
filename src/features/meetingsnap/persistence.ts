import { getDatabaseClient } from "~/db";
import { MEETING_TIERS, normalizeMeetingTier, type MeetingTier } from "./tiers";

export interface MeetingReservation { id: number; tier: MeetingTier; createdAt: string }

/** Empty-source rows are temporary quota reservations, never visible meetings. */
export async function reserveMeeting(userId: string, audio = false): Promise<MeetingReservation> {
  const q = getDatabaseClient();
  // Lock the owner before counting. ReadCommitted gives the count a fresh
  // snapshot after any preceding reservation transaction releases this lock.
  const results = await q.transaction([
    q`INSERT INTO users (clerk_user_id) VALUES (${userId}) ON CONFLICT (clerk_user_id) DO NOTHING`,
    q`SELECT clerk_user_id FROM users WHERE clerk_user_id = ${userId} FOR UPDATE`,
    q`DELETE FROM meetings WHERE clerk_user_id = ${userId} AND source_text = ''
       AND created_at < NOW() - INTERVAL '15 minutes'`,
    q`INSERT INTO meetings (clerk_user_id, title, source_text)
       SELECT ${userId}, 'Processing meeting', '' FROM users u
       WHERE u.clerk_user_id = ${userId}
         AND (${audio} = false OR u.meeting_subscription_status IN ('personal', 'pro', 'team'))
         AND (SELECT COUNT(*) FROM meetings m WHERE m.clerk_user_id = ${userId}
              AND m.created_at >= date_trunc('month', NOW())) <
             CASE u.meeting_subscription_status
               WHEN 'personal' THEN ${MEETING_TIERS.personal.meetingsPerMonth}
               WHEN 'pro' THEN ${MEETING_TIERS.pro.meetingsPerMonth}
               WHEN 'team' THEN 2147483647
               ELSE ${MEETING_TIERS.free.meetingsPerMonth} END
       RETURNING id, created_at,
         (SELECT meeting_subscription_status FROM users WHERE clerk_user_id = ${userId}) AS tier`,
  ], { isolationLevel: "ReadCommitted" });
  const row = results[3][0];
  if (!row) throw new Error("Your meeting allowance is exhausted, or your plan does not include recording transcription.");
  return { id: Number(row.id), tier: normalizeMeetingTier(row.tier as string), createdAt: String(row.created_at) };
}

/** Both the original transcript and its extraction commit, or neither does. */
export async function completeMeeting(userId: string, reservation: MeetingReservation, title: string, sourceText: string, extraction: unknown): Promise<void> {
  const q = getDatabaseClient();
  const rows = await q`
    WITH completed AS (
      UPDATE meetings SET title = ${title || "Untitled meeting"}, source_text = ${sourceText}
      WHERE id = ${reservation.id} AND clerk_user_id = ${userId} AND source_text = ''
        AND created_at >= NOW() - INTERVAL '15 minutes'
      RETURNING id
    )
    INSERT INTO meeting_extractions (meeting_id, extraction)
    SELECT id, ${JSON.stringify(extraction)}::jsonb FROM completed RETURNING meeting_id
  `;
  if (!rows[0]) throw new Error("Meeting processing expired. Please try again.");
}

export async function releaseMeeting(userId: string, reservation: MeetingReservation): Promise<void> {
  const q = getDatabaseClient();
  await q`DELETE FROM meetings WHERE id = ${reservation.id} AND clerk_user_id = ${userId} AND source_text = ''`;
}
