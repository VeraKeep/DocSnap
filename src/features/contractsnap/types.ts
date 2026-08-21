/**
 * ContractSnap module — shared data types.
 *
 * The MVP turns an uploaded contract (PDF) into a structured, actively
 * monitored record: the important facts (title, type, parties, dates, renewal,
 * cancellation window, notice, payment, fees, penalties, jurisdiction,
 * obligations) plus an AI plain-language summary, detected clauses, a contract
 * timeline, and reminders.
 *
 * TRUST is foundational: every extracted value is tagged with a
 * `source_status` of "confirmed" (stated plainly in the document) vs
 * "interpreted" (inferred by AI), and a 0..1 `confidence` score. Low-confidence
 * fields are surfaced for human review rather than treated as authoritative.
 * The ORIGINAL source text is the immutable source of truth.
 */

export type SourceStatus = "confirmed" | "interpreted";

/** A date/amount/scalar fact that carries a trust tag. */
export interface TypedFact {
  value: string | number | boolean | null;
  source_status: SourceStatus;
  confidence: number;
}

export interface ContractParty {
  name: string | null;
  role: string | null;
  source_status: SourceStatus;
  confidence: number;
}

export interface ContractPayment {
  amount: number | null;
  currency: string | null;
  frequency: string | null;
  source_status: SourceStatus;
  confidence: number;
}

/** The AI plain-language summary sections (informational, not legal advice). */
export interface ContractSummary {
  what_this_contract_does: string;
  what_you_pay: string;
  what_you_must_do: string;
  what_they_must_do: string;
  important_dates: string[];
  watch_out_for: string[];
}

export interface ContractClause {
  id: number;
  type: string;
  text: string;
  location: string | null;
  confidence: number;
  source_status: SourceStatus;
}

export type ContractEventType =
  | "signed"
  | "effective"
  | "cancellation_deadline"
  | "renewal"
  | "expiration";

export interface ContractEvent {
  id: number;
  event_type: ContractEventType | string;
  date: string | null;
  /** Where the event's date came from: confirmed / interpreted / document. */
  source: string;
}

export interface ContractReminder {
  id: number;
  type: "renewal" | "cancellation" | "expiration" | string;
  due_date: string | null;
  delivered: boolean;
}

/** The full AI-extracted structure for one contract (stored as JSONB). */
export interface ContractExtraction {
  title: string;
  contract_type: string | null;
  parties: ContractParty[];
  effective_date: TypedFact | null;
  expiration_date: TypedFact | null;
  renewal_date: TypedFact | null;
  cancellation_deadline: TypedFact | null;
  cancellation_window_days: TypedFact | null;
  notice_period_days: TypedFact | null;
  auto_renewal: TypedFact | null;
  /** auto | manual | none | unknown */
  renewal_type: string | null;
  payment: ContractPayment | null;
  fees: string | null;
  deposits: string | null;
  penalties: string | null;
  jurisdiction: string | null;
  major_obligations: string[];
  summary: ContractSummary;
  clauses: ContractClause[];
  events: ContractEvent[];
  reminders: ContractReminder[];
}

/** A contract list row (no heavy extraction payload). */
export interface ContractRow {
  id: number;
  title: string;
  contract_type: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  renewal_date: string | null;
  cancellation_deadline: string | null;
  auto_renewal: boolean | null;
  renewal_type: string | null;
  /** pending | complete — pending means AI wasn't connected when extracted. */
  analysis_status: string;
  status: string;
  created_at: string | null;
}

/** A full contract with its source text and parsed extraction. */
export interface ContractDetail extends ContractRow {
  sourceText: string;
  original_file_ref: string | null;
  extraction: ContractExtraction | null;
}

/** One hit from a keyword search over the user's saved contracts. */
export interface ContractSearchResult extends ContractRow {
  matchedOn: "title" | "content";
}

/** ContractSnap entitlement/config for the signed-in user. */
export interface ContractEntitlement {
  configured: boolean;
  /** True when the user may use the module (add-on gate resolution). */
  hasAddon: boolean;
}

/** Any extracted fact whose confidence falls below this needs human review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Render a fact value as display text (tolerant of AI oddities). */
export function factText(fact: TypedFact | null | undefined): string {
  if (!fact || fact.value == null || fact.value === "") return "—";
  return String(fact.value);
}

/** The ordered timeline steps in display order for the contract timeline. */
export const TIMELINE_STEP_LABELS: Record<string, string> = {
  signed: "Signed",
  effective: "Effective",
  cancellation_deadline: "Cancellation deadline",
  renewal: "Renewal",
  expiration: "Expiration",
};
