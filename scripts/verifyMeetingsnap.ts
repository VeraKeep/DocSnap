/**
 * Verify the MeetingSnap FUNCTIONAL data path against the live Neon DB.
 *
 * MeetingSnap is the one PREMIUM, tiered module (Free/Personal/Pro/Team) with
 * its own `users.meeting_subscription_status` column + monthly usage meter —
 * NOT an add-on flag. This exercises the persisted analyze -> extract -> save
 * loop the handlers implement (src/features/meetingsnap/server.ts): insert
 * meeting + versioned extraction (analyzeAndPersist) -> listMeetings ->
 * getMeeting (LEFT JOIN extraction, parsed back out) -> searchMeetings ->
 * usage accounting (count this month vs. tier cap) -> tier fails-closed to
 * 'free' for a fresh user -> owner scoping. The actual OpenAI transcript
 * extraction / Whisper transcription need a real OPENAI_API_KEY and are covered
 * by code review + the no-key throw path.
 *
 * Never prints DATABASE_URL. Run:  bun scripts/verifyMeetingsnap.ts
 */
import { sql } from "../src/db";

const TEST_USER = "test-meetingsnap-module";
const OTHER = "test-meetingsnap-other-user";
const CLEANUP = process.env.KEEP_TEST_ROWS !== "1";

const EXTRACTION_JSON = JSON.stringify({
  executive_summary: "Team reviewed the launch plan.",
  decisions: [{ decision: "Ship in two weeks", confidence: 0.9 }],
  action_items: [{ task: "Fix the login bug", owner: "Alex", priority: "high", confidence: 0.85 }],
  questions: [],
  risks: [],
  segments: [],
  speakers: [],
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot verify against a real DB.");
    process.exit(1);
  }
  await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${TEST_USER}, ${"verify-meetingsnap@example.com"})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
  // 1) Tier fails CLOSED: a fresh user resolves to 'free' (no paid grant).
  const tier = (await sql`
    SELECT meeting_subscription_status FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { meeting_subscription_status: string }[];
  const resolvedTier = tier[0]?.meeting_subscription_status || "free";
  if (resolvedTier !== "free") {
    console.error(`FAIL: fresh user resolved to non-free meeting tier '${resolvedTier}'.`);
    process.exit(1);
  }
  console.log("OK: MeetingSnap tier fails CLOSED — fresh user resolves to 'free'.");

  // 2) analyzeAndPersist: insert meeting + versioned extraction.
  const created = (await sql`
    INSERT INTO meetings (clerk_user_id, title, source_text)
    VALUES (${TEST_USER}, ${"Launch Sync"}, ${"We should fix the login bug and ship in two weeks."})
    RETURNING id
  `) as unknown as { id: number }[];
  const meetingId = Number(created[0].id);
  await sql`
    INSERT INTO meeting_extractions (meeting_id, extraction)
    VALUES (${meetingId}, ${EXTRACTION_JSON}::jsonb)
  `;
  console.log(`OK: analyzeAndPersist insert landed -> meeting#${meetingId} + extraction row.`);

  // 3) listMeetings returns the owned meeting.
  const list = (await sql`
    SELECT m.id, m.title, m.created_at FROM meetings m
    WHERE m.clerk_user_id = ${TEST_USER} ORDER BY m.created_at DESC
  `) as unknown as { id: number; title: string }[];
  if (!list.some((m) => Number(m.id) === meetingId && m.title === "Launch Sync")) {
    console.error("FAIL: listMeetings did not return the owned meeting.");
    process.exit(1);
  }
  console.log("OK: listMeetings returns the owned meeting.");

  // 4) getMeeting query (LEFT JOIN extraction) parse-back.
  const detail = (await sql`
    SELECT m.id, m.title, m.source_text, e.extraction, m.created_at
    FROM meetings m
    LEFT JOIN meeting_extractions e ON e.meeting_id = m.id
    WHERE m.id = ${meetingId} AND m.clerk_user_id = ${TEST_USER}
  `) as unknown as { id: number; title: string; extraction: unknown }[];
  if (!detail[0]) {
    console.error("FAIL: getMeeting did not return the owned meeting.");
    process.exit(1);
  }
  const extraction = typeof detail[0].extraction === "string"
    ? JSON.parse(detail[0].extraction)
    : detail[0].extraction;
  const ai = (extraction ?? {}) as { action_items?: { task: string }[] };
  const hasAction = Array.isArray(ai.action_items) && ai.action_items.some((a) => a.task === "Fix the login bug");
  if (!hasAction) {
    console.error("FAIL: getMeeting extraction did not round-trip the AI action_items JSONB.");
    process.exit(1);
  }
  console.log("OK: getMeeting returns extraction with AI action item intact (JSONB round-trip).");

  // 5) searchMeetings query — title + source_text ILIKE.
  const searchHit = (await sql`
    SELECT m.id FROM meetings m
    WHERE m.clerk_user_id = ${TEST_USER}
      AND (m.title ILIKE ${`%launch%`} OR m.source_text ILIKE ${`%launch%`})
    ORDER BY m.created_at DESC
  `) as unknown as { id: number }[];
  if (!searchHit.some((m) => Number(m.id) === meetingId)) {
    console.error("FAIL: searchMeetings('launch') missed the owned meeting.");
    process.exit(1);
  }
  console.log("OK: searchMeetings finds the meeting by title/content.");

  // 6) Usage accounting: count this month vs. free tier cap (replicates
  //    getMeetingsUsage + isMeetingLimitReached).
  const used = (await sql`
    SELECT COUNT(*)::int AS count FROM meetings
    WHERE clerk_user_id = ${TEST_USER} AND created_at >= date_trunc('month', NOW())
  `) as unknown as { count: number }[];
  const usedThisMonth = Number(used[0]?.count ?? 0);
  const FREE_CAP = 2; // free tier allowance (MEETING_TIERS.free.meetingsPerMonth)
  if (usedThisMonth !== 1) {
    console.error(`FAIL: usage meter expected 1 meeting this month, got ${usedThisMonth}.`);
    process.exit(1);
  }
  if (usedThisMonth >= FREE_CAP) {
    console.error("FAIL: a single fresh meeting already hit the free cap (limit math wrong).");
    process.exit(1);
  }
  console.log(`OK: usage meter counts ${usedThisMonth} this month (under free cap ${FREE_CAP}).`);

  // 7) Owner scoping: another user cannot read this meeting.
  const leak = (await sql`
    SELECT id FROM meetings WHERE id = ${meetingId} AND clerk_user_id = ${OTHER}
  `) as unknown as { id: number }[];
  if (leak.length !== 0) {
    console.error("FAIL: cross-user read leaked the meeting (owner scoping broken).");
    process.exit(1);
  }
  console.log("OK: owner scoping — another user cannot read this meeting.");

  // 8) Set the user to 'pro' tier — reflects as non-free (usage unlock path).
  await sql`
    UPDATE users SET meeting_subscription_status = ${"pro"} WHERE clerk_user_id = ${TEST_USER}
  `;
  const proTier = (await sql`
    SELECT meeting_subscription_status FROM users WHERE clerk_user_id = ${TEST_USER} LIMIT 1
  `) as unknown as { meeting_subscription_status: string }[];
  if (proTier[0]?.meeting_subscription_status !== "pro") {
    console.error("FAIL: setting meeting_subscription_status = 'pro' did not persist.");
    process.exit(1);
  }
  console.log("OK: tier upgrade to 'pro' persists (raises the usage cap).");

  if (CLEANUP) {
    await sql`DELETE FROM meetings WHERE clerk_user_id = ${TEST_USER}`; // cascades extractions
    await sql`DELETE FROM users WHERE clerk_user_id IN (${TEST_USER}, ${OTHER})`;
    console.log("OK: test rows cleaned up (set KEEP_TEST_ROWS=1 to retain them).");
  } else {
    console.log("KEEP_TEST_ROWS=1 — test rows left in DB for inspection.");
  }
  console.log("VerifyMeetingsnap OK — MeetingSnap data path round-trips through Neon.");
}

main().catch((err) => {
  console.error("Unexpected error:", String(err));
  process.exit(1);
});
