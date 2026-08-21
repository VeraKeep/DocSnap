/**
 * MeetingSnap tier model — the owner's authoritative 4-tier plan (business
 * plan rev 16, 2026-08-20). MeetingSnap tiers are intentionally INDEPENDENT
 * from DocSnap's subscription_status: they live in their own per-user column
 * (`users.meeting_subscription_status`) so a DocSnap subscriber's tier does
 * not dictate what they get from MeetingSnap.
 *
 * Owner tiers:
 *   Free     $0      — 2 meetings/month. Transcript upload + basic summary,
 *                      action items, decisions. Just enough to show the "wow".
 *   Personal $5.99   — 10 meetings/month, full summaries, action items,
 *                      owners, deadlines, decisions, risks, follow-up email,
 *                      search, history, exports. (Personal is the tier bundled
 *                      into VeraKeep All Access.)
 *   Pro      $14.99  — 40 meetings/month, larger transcripts, AI Q&A,
 *                      cross-meeting search, decision history, advanced
 *                      exports, integrations, priority processing.
 *   Team     $8/user — shared workspaces, assignments, permissions, history,
 *                      org-wide search, admin, audit logs. (Workspaces are a
 *                      later chunk; the limit flag is wired now.)
 */

export type MeetingTier = "free" | "personal" | "pro" | "team";

/**
 * Feature flags per tier, driven by the owner's feature lists:
 *  - free     → basic summary + action items + decisions ONLY.
 *  - personal → the longer full-feature list (full summaries, owners,
 *               deadlines, decisions, risks, follow-up email, search, history,
 *               exports). askAI/cross-meeting search are Pro, so false here.
 *  - pro      → adds AI Q&A, cross-meeting search, advanced exports,
 *               integrations, priority processing.
 *  - team     → add org features (team=true); inherits everything else.
 */
export interface MeetingTierFeatures {
  /** Full-length executive summaries (free gets a basic summary). */
  fullSummaries: boolean;
  /** AI Q&A over saved meetings ("Ask AI"). */
  askAI: boolean;
  /** Cross-meeting keyword search across all saved meetings. */
  crossMeetingSearch: boolean;
  /** Follow-up email drafts from open action items. */
  followUpEmail: boolean;
  /** Advanced export options (MD/PDF/action lists etc.). */
  advancedExports: boolean;
  /** Calendar/email/task integrations (future). */
  integrations: boolean;
  /** Priority processing for queued transcripts (future). */
  priorityProcessing: boolean;
  /** Team-tier org features (workspaces, assignments, permissions...). */
  team: boolean;
  /** Structured owner + deadlines on action items. */
  ownerDeadlines: boolean;
}

export interface MeetingTierConfig {
  id: MeetingTier;
  label: string;
  /**
   * Monthly analysis allowance. `Infinity` = unlimited (Team tier).
   * Metered against `meetings.created_at >= date_trunc('month', NOW())`.
   */
  meetingsPerMonth: number;
  /**
   * Transcript size cap (characters) accepted per analysis. Chosen so each
   * paid tier can comfortably process a representative meeting length:
   *   free 50k   — roughly a ~30 min verbatim transcript.
   *   personal  100k — ~1 hour; comfortable default for individuals.
   *   pro       400k — multi-hour or long meeting-capture transcript.
   *   team      1M   — max edge-friendly payload / shared-org transcripts.
   */
  maxTranscriptChars: number;
  features: MeetingTierFeatures;
}

/** All MeetingSnap tier configs, keyed by tier id. */
export const MEETING_TIERS: Record<MeetingTier, MeetingTierConfig> = {
  free: {
    id: "free",
    label: "Free",
    meetingsPerMonth: 2,
    maxTranscriptChars: 50_000,
    features: {
      fullSummaries: false,
      askAI: false,
      crossMeetingSearch: false,
      followUpEmail: false,
      advancedExports: false,
      integrations: false,
      priorityProcessing: false,
      team: false,
      ownerDeadlines: false,
    },
  },
  personal: {
    id: "personal",
    label: "Personal",
    meetingsPerMonth: 10,
    maxTranscriptChars: 100_000,
    features: {
      fullSummaries: true,
      askAI: false,
      crossMeetingSearch: false,
      followUpEmail: true,
      advancedExports: true,
      integrations: false,
      priorityProcessing: false,
      team: false,
      ownerDeadlines: true,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    meetingsPerMonth: 40,
    maxTranscriptChars: 400_000,
    features: {
      fullSummaries: true,
      askAI: true,
      crossMeetingSearch: true,
      followUpEmail: true,
      advancedExports: true,
      integrations: true,
      priorityProcessing: true,
      team: false,
      ownerDeadlines: true,
    },
  },
  team: {
    id: "team",
    label: "Team",
    meetingsPerMonth: Infinity,
    maxTranscriptChars: 1_000_000,
    features: {
      fullSummaries: true,
      askAI: true,
      crossMeetingSearch: true,
      followUpEmail: true,
      advancedExports: true,
      integrations: true,
      priorityProcessing: true,
      team: true,
      ownerDeadlines: true,
    },
  },
};

/**
 * The largest transcript cap across all tiers. Used as an absolute server-side
 * guard in the request validator so a single oversize payload is rejected
 * before any per-user tier lookup; the precise per-tier cap is then enforced
 * on the authenticated user's own tier inside the handler.
 */
export const MAX_TIER_TRANSCRIPT_CHARS =
  MEETING_TIERS.team.maxTranscriptChars;

/**
 * Normalize a raw `meeting_subscription_status` DB value into a MeetingTier.
 * Fails closed: anything unknown/missing resolves to `free` so a user can
 * never claim a paid tier they weren't granted.
 */
export function normalizeMeetingTier(
  status: string | null | undefined,
): MeetingTier {
  switch (status) {
    case "personal":
      return "personal";
    case "pro":
      return "pro";
    case "team":
      return "team";
    default:
      return "free";
  }
}
