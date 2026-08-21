/**
 * MeetingSnap module — shared data types.
 *
 * The MVP turns a raw meeting transcript into structured organizational
 * knowledge: an executive summary, decisions, action items (with owners and
 * due dates), questions, and risks. Every extracted item carries a
 * `confidence` score in [0, 1] — "trusted, not just generated". Low-confidence
 * items are flagged for human review before they become authoritative records.
 *
 * The ORIGINAL transcript is the immutable source of truth; the extraction is
 * versioned derived data (stored as JSONB, re-processable as models improve).
 */
export interface MeetingDecision {
  decision: string;
  reason: string | null;
  participants: string[];
  confidence: number;
}

export interface MeetingActionItem {
  task: string;
  owner: string | null;
  priority: "high" | "medium" | "low" | "none" | null;
  status: string | null;
  due_date: string | null;
  dependencies: string[];
  confidence: number;
}

export interface MeetingQuestion {
  question: string;
  answered: boolean;
  confidence: number;
}

export interface MeetingRisk {
  description: string;
  likelihood: "high" | "medium" | "low" | null;
  impact: "high" | "medium" | "low" | null;
  mitigation: string | null;
  owner: string | null;
  confidence: number;
}

/**
 * The full AI-extracted structure for one meeting. This shape is what the
 * model is asked to return (strict JSON) and what is stored as derived JSONB.
 */
export interface MeetingExtraction {
  executive_summary: string;
  decisions: MeetingDecision[];
  action_items: MeetingActionItem[];
  questions: MeetingQuestion[];
  risks: MeetingRisk[];
}

/** Any extracted item whose confidence falls below this needs human review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** True when an extracted item should be flagged "Review — low confidence." */
export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** A persisted meeting row (immutable source transcript). */
export interface MeetingSummary {
  id: number;
  title: string;
  /** When persistence isn't configured this is null and the meeting is session-only. */
  createdAt: string | null;
}

/** A meeting with its extracted knowledge (joined from meeting_extractions). */
export interface MeetingDetail extends MeetingSummary {
  sourceText: string;
  extraction: MeetingExtraction;
}
