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
/**
 * One timestamped slice of the transcribed recording. Deepgram diarization will
 * fill `speaker` ("Speaker 0", "Speaker 1", ...) later; today (timestamp-only
 * stepping stone) `speaker` is always null and `speakers` on the extraction is
 * empty. `start_sec`/`end_sec` are absolute seconds within the recording.
 */
export interface MeetingSegment {
  speaker: string | null; // "Speaker 1" now always null; filled by Deepgram later
  start_sec: number;
  end_sec: number;
  text: string;
}

export interface MeetingDecision {
  decision: string;
  reason: string | null;
  participants: string[];
  confidence: number;
  /** "Speaker 1" label whose words support this item — null in the stepping stone. */
  speaker: string | null;
  /** 0..1 — how attributable this item is to the labelled speaker. 0 in the stepping stone. */
  speaker_confidence: number;
  /** True when the speaker attribution is missing or uncertain (needs review). */
  speakerUnverified: boolean;
}

export interface MeetingActionItem {
  task: string;
  owner: string | null;
  priority: "high" | "medium" | "low" | "none" | null;
  status: string | null;
  due_date: string | null;
  dependencies: string[];
  confidence: number;
  /** "Speaker 1" label whose words support this item — null in the stepping stone. */
  speaker: string | null;
  /** 0..1 — how attributable this item is to the labelled speaker. 0 in the stepping stone. */
  speaker_confidence: number;
  /** True when the speaker attribution is missing or uncertain (needs review). */
  speakerUnverified: boolean;
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
  /** "Speaker 1" label whose words support this item — null in the stepping stone. */
  speaker: string | null;
  /** 0..1 — how attributable this item is to the labelled speaker. 0 in the stepping stone. */
  speaker_confidence: number;
  /** True when the speaker attribution is missing or uncertain (needs review). */
  speakerUnverified: boolean;
}

/**
 * The full AI-extracted structure for one meeting. This shape is what the
 * model is asked to return (strict JSON) and what is stored as derived JSONB.
 * `segments`/`speakers` are the transcription-side metadata (timestamps, and
 * later speaker labels) — they ride along as versioned derived data, exactly
 * like the rest of the extraction.
 */
export interface MeetingExtraction {
  executive_summary: string;
  decisions: MeetingDecision[];
  action_items: MeetingActionItem[];
  questions: MeetingQuestion[];
  risks: MeetingRisk[];
  /** Timestamped slices of the recording. Empty for text/pasted transcripts. */
  segments: MeetingSegment[];
  /** Ordered distinct speaker labels (e.g. ["Speaker 0","Speaker 1"]). Empty now. */
  speakers: string[];
}

/** Any extracted item whose confidence falls below this needs human review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** True when an extracted item should be flagged "Review — low confidence." */
export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Speaker attribution threshold, mirroring LOW_CONFIDENCE_THRESHOLD. A speaker
 * is considered "verified" only when a label is present AND its confidence is
 * high enough (>0.6). Null speaker (timestamp-only / pasted transcripts) or a
 * low-confidence attribution is treated as unverified.
 */
export const SPEAKER_CONFIDENCE_THRESHOLD = 0.6;

/** True when a speaker attribution is missing or uncertain (needs review). */
export function isSpeakerUnverified(
  speaker: string | null | undefined,
  speakerConfidence: number,
): boolean {
  return (
    speaker == null || speaker.trim() === "" || speakerConfidence < SPEAKER_CONFIDENCE_THRESHOLD
  );
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

/** One hit from a keyword search over the user's saved meetings. */
export interface MeetingSearchResult extends MeetingSummary {
  /** Whether the match came from the title or from meeting content. */
  matchedOn: "title" | "content";
}

/** A grounded, per-user answer from "Ask AI" over the user's saved meetings. */
export interface AskAIResult {
  answer: string;
  /** The meeting ids/titles whose content support the answer (empty = none). */
  references: { id: number; title: string }[];
  /** True only when the answer is directly supported by the meetings. */
  grounded: boolean;
}

/** A follow-up email DRAFT — never sent automatically, only shown for copy/edit. */
export interface FollowUpDraft {
  subject: string;
  body: string;
}
