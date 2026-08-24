/**
 * ContractSnap module — owner-scoped server functions.
 *
 * Contract data is personal and scoped to exactly one Clerk user. The owner
 * identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); a client-supplied owner id is never trusted. All
 * queries filter by the server-resolved owner, so no cross-user reads are
 * possible.
 *
 * Persistence mirrors the rest of DocSnap: `~/db` (Neon Postgres) and the host
 * schema (src/db-schema.sql). When DATABASE_URL is unset, `sql()` no-ops
 * safely, so the module still builds and the analyze flow still works in a
 * session-only demo path.
 *
 * Extraction reuses the exact MeetingSnap/ReceiptSnap AI pattern: a server-side
 * fetch to the OpenAI chat completions API (model gpt-4o-mini, temperature 0,
 * JSON object response). No key is ever hardcoded; if OPENAI_API_KEY is unset
 * at runtime we DEGRADE GRACEFULLY — the contract is still recorded with its
 * raw source text, `analysis_status` is set to "pending", and the client shows
 * the honest "Analysis pending — AI not connected" message (so the module
 * builds, runs, and demoes end-to-end without the key).
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import { hasContractSnapAddon } from "~/subscription";
import {
  type ContractClause,
  type ContractDetail,
  type ContractEvent,
  type ContractExtraction,
  type ContractParty,
  type ContractPayment,
  type ContractReminder,
  type ContractRow,
  type ContractSearchResponse,
  type ContractSummary,
  type SourceStatus,
  type TypedFact,
} from "./types";

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 400_000; // generous safe cap on a contract's raw text
const MAX_LISTS = 100;
/* ------------------------------------------------------------------ */
/* Hard add-on entitlement gate (business-plan rev 3)                  */
/* ------------------------------------------------------------------ */
export const ADDON_LOCKED_MESSAGE =
  "ContractSnap is a paid add-on. You don't own it yet - upgrade to use /contracts.";
export const ADDON_LOCKED_CODE = "contractsnap_addon_required";
/**
 * HARD entitlement gate (business-plan rev 3). ContractSnap is a paid add-on,
 * NOT bundled into any DocSnap tier. Fails CLOSED with HTTP 403 for any
 * signed-in user who does not own the add-on - including every paid
 * (Personal/Household/Complete) subscriber. Anonymous callers are already
 * rejected with 401 by requireServerFunctionUser.
 */
async function requireContractSnapAddon(userId: string): Promise<void> {
  const owned = await hasContractSnapAddon(userId);
  if (!owned) {
    throw new Response(
      JSON.stringify({ error: ADDON_LOCKED_MESSAGE, code: ADDON_LOCKED_CODE }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Small robust parsing helpers (same convention as MeetingSnap)       */
/* ------------------------------------------------------------------ */
export function cleanJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  return String(v).trim() || null;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x) ?? "").filter(Boolean).slice(0, MAX_LISTS);
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "yes") return true;
  if (v === false || v === "false" || v === "no") return false;
  return null;
}

function asSourceStatus(v: unknown, fallback: SourceStatus = "interpreted"): SourceStatus {
  const s = asString(v)?.toLowerCase();
  if (s === "confirmed" || s === "confirmed from document" || s === "document") return "confirmed";
  return fallback;
}

/** Normalize a TypedFact (date/amount/flag with trust tag). */
function factFrom(v: unknown): TypedFact | null {
  const r = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!r) return null;
  const value =
    r.value === true || r.value === false ? r.value : (asString(r.value) as string | number | boolean | null);
  if (value == null || value === "") return null;
  return {
    value,
    source_status: asSourceStatus(r.source_status),
    confidence: clampConfidence(r.confidence),
  };
}

function normParty(raw: Record<string, unknown>): ContractParty {
  return {
    name: asString(raw.name),
    role: asString(raw.role),
    source_status: asSourceStatus(raw.source_status),
    confidence: clampConfidence(raw.confidence),
  };
}

function normPayment(raw: unknown): ContractPayment | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: asString(r.currency),
    frequency: asString(r.frequency),
    source_status: asSourceStatus(r.source_status),
    confidence: clampConfidence(r.confidence),
  };
}

function normClause(raw: Record<string, unknown>): ContractClause {
  return {
    id: 0, // DB-assigned on persist; 0 for session-only
    type: asString(raw.type) ?? "clause",
    text: asString(raw.text) ?? "",
    location: asString(raw.location),
    confidence: clampConfidence(raw.confidence),
    source_status: asSourceStatus(raw.source_status),
  };
}

function normEvent(raw: Record<string, unknown>): ContractEvent {
  return {
    id: 0,
    event_type: asString(raw.event_type) ?? "other",
    date: asString(raw.date),
    source: asString(raw.source) ?? "interpreted",
  };
}

function normReminder(raw: Record<string, unknown>): ContractReminder {
  return {
    id: 0,
    type: asString(raw.type) ?? "renewal",
    due_date: asString(raw.due_date),
    delivered: raw.delivered === true,
  };
}

function normSummary(raw: Record<string, unknown>): ContractSummary {
  return {
    what_this_contract_does: asString(raw.what_this_contract_does) ?? "",
    what_you_pay: asString(raw.what_you_pay) ?? "",
    what_you_must_do: asString(raw.what_you_must_do) ?? "",
    what_they_must_do: asString(raw.what_they_must_do) ?? "",
    important_dates: asStringList(raw.important_dates),
    watch_out_for: asStringList(raw.watch_out_for),
  };
}

/** Normalize arbitrary model output into the strict ContractExtraction shape. */
export function normalizeExtraction(raw: unknown, fallbackTitle = ""): ContractExtraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    title: (asString(r.title) ?? fallbackTitle) || "Untitled contract",
    contract_type: asString(r.contract_type),
    parties: Array.isArray(r.parties)
      ? r.parties
          .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
          .map((p) => normParty(p))
          .slice(0, MAX_LISTS)
      : [],
    effective_date: factFrom(r.effective_date),
    expiration_date: factFrom(r.expiration_date),
    renewal_date: factFrom(r.renewal_date),
    cancellation_deadline: factFrom(r.cancellation_deadline),
    cancellation_window_days: factFrom(r.cancellation_window_days),
    notice_period_days: factFrom(r.notice_period_days),
    auto_renewal: factFrom(r.auto_renewal),
    renewal_type: asString(r.renewal_type),
    payment: normPayment(r.payment),
    fees: asString(r.fees),
    deposits: asString(r.deposits),
    penalties: asString(r.penalties),
    jurisdiction: asString(r.jurisdiction),
    major_obligations: asStringList(r.major_obligations),
    summary: normSummary((r.summary ?? {}) as Record<string, unknown>),
    clauses: Array.isArray(r.clauses)
      ? r.clauses
          .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
          .map((c) => normClause(c))
          .slice(0, MAX_LISTS)
      : [],
    events: Array.isArray(r.events)
      ? r.events
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => normEvent(e))
          .slice(0, MAX_LISTS)
      : [],
    reminders: Array.isArray(r.reminders)
      ? r.reminders
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .map((x) => normReminder(x))
          .slice(0, MAX_LISTS)
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* AI extraction (reuses the MeetingSnap openAiJson pattern)           */
/* ------------------------------------------------------------------ */
async function openAiJson(
  systemPrompt: string,
  userContent: string,
): Promise<Record<string, unknown>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("This isn't enabled yet — the AI backend (OPENAI_API_KEY) isn't connected.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let reason = detail;
    try {
      const j = JSON.parse(detail);
      if (j?.error?.message) reason = j.error.message;
    } catch {
      /* keep raw body */
    }
    throw new Error(
      `AI request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}): ${reason.slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = cleanJson(body.choices?.[0]?.message?.content ?? "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The AI response could not be read as structured data.");
  }
  return parsed as Record<string, unknown>;
}

/**
 * The "trusted, not just generated" system prompt. The model must distinguish
 * "confirmed from document" (stated plainly) from "AI interpretation"
 * (inferred), and must never invent facts, dates, amounts, or clause text that
 * are not in the contract.
 */
const SYSTEM_PROMPT = `You extract structured information from a contract/agreement document. You are trustworthy, not just fluent.

TRUST RULES (this is a legal document — accuracy matters):
- Every fact carries a "source_status": set it to "confirmed" ONLY when the fact is stated plainly and directly in the document text (e.g. an explicit date like "effective January 15, 2026", an explicit amount, an explicit auto-renewal clause). Set it to "interpreted" when the fact is inferred, implied, hedged, or derived (e.g. "looks like", "appears", "likely", or computed from other terms).
- Set "confidence" (0..1) for every extracted fact/clause/event. Use >= 0.85 for plainly stated facts, and lower values (below 0.6) for anything tentative or implied.
- NEVER invent a date, amount, party name, obligation, or clause that is not in the document. Use null / [] when the document does not state it.
- "title" should be the contract's own title if present (e.g. "Residential Lease Agreement"), otherwise the best short description.
- "renewal_type" is one of: "auto" (contract renews automatically), "manual" (renewal requires action), "none" (fixed term, no renewal), or "unknown".
- "auto_renewal.value" is a boolean: true when the contract renews automatically, false when it does not.
- "cancellation_window_days" = days before renewal/expiration by which notice of non-renewal must be given, when stated.
- "events" are timeline milestones with event_type one of: "signed", "effective", "cancellation_deadline", "renewal", "expiration". Use the date each milestone occurs (or will occur), with "source" = "confirmed" | "interpreted".
- "reminders" are actionable dates someone would want to be reminded about: type one of "renewal" | "cancellation" | "expiration", and "due_date" the relevant date.
- "clauses" are the important detected clauses of the contract, each with "type" (e.g. renewal, termination, payment, notice, penalty, indemnification, jurisdiction, confidentiality, non-compete, auto-renewal), "text" (a short verbatim or near-verbatim excerpt from the document), "location" (section number / clause reference if visible), source_status, and confidence.

Return STRICT JSON only, with exactly this shape:
{
  "title": string,
  "contract_type": string|null,
  "parties": [{ "name": string|null, "role": string|null, "source_status": "confirmed"|"interpreted", "confidence": number }],
  "effective_date": { "value": string|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "expiration_date": { "value": string|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "renewal_date": { "value": string|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "cancellation_deadline": { "value": string|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "cancellation_window_days": { "value": number|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "notice_period_days": { "value": number|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "auto_renewal": { "value": boolean|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "renewal_type": "auto"|"manual"|"none"|"unknown"|null,
  "payment": { "amount": number|null, "currency": string|null, "frequency": string|null, "source_status": "confirmed"|"interpreted", "confidence": number } | null,
  "fees": string|null,
  "deposits": string|null,
  "penalties": string|null,
  "jurisdiction": string|null,
  "major_obligations": string[],
  "summary": {
    "what_this_contract_does": string,
    "what_you_pay": string,
    "what_you_must_do": string,
    "what_they_must_do": string,
    "important_dates": string[],
    "watch_out_for": string[]
  },
  "clauses": [{ "type": string, "text": string, "location": string|null, "source_status": "confirmed"|"interpreted", "confidence": number }],
  "events": [{ "event_type": string, "date": string|null, "source": "confirmed"|"interpreted" }],
  "reminders": [{ "type": string, "due_date": string|null, "delivered": boolean }]
}
Keep summaries plain-language and informational. Use [] for empty lists. Do not include anything outside this JSON object.`;

async function extractWithAI(sourceText: string, titleHint: string): Promise<ContractExtraction> {
  const parsed = await openAiJson(
    SYSTEM_PROMPT,
    `Contract file name / user title hint: ${titleHint || "(none)"}\n\nContract text:\n${sourceText}`,
  );
  return normalizeExtraction(parsed, titleHint);
}

/* ------------------------------------------------------------------ */
/* Row mappers                                                         */
/* ------------------------------------------------------------------ */
function toRow(r: Record<string, unknown>): ContractRow {
  return {
    id: Number(r.id),
    title: asString(r.title) ?? "Untitled contract",
    contract_type: asString(r.contract_type),
    effective_date: asString(r.effective_date),
    expiration_date: asString(r.expiration_date),
    renewal_date: asString(r.renewal_date),
    cancellation_deadline: asString(r.cancellation_deadline),
    auto_renewal: asBool(r.auto_renewal),
    renewal_type: asString(r.renewal_type),
    analysis_status: asString(r.analysis_status) ?? "pending",
    status: asString(r.status) ?? "analyzed",
    created_at: r.created_at == null ? null : String(r.created_at),
  };
}

function asDateFromFact(v: unknown): string | null {
  const f = factFrom(v);
  return f?.value == null ? null : String(f.value);
}

export const getContractsEntitlement = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; hasAddon: boolean; aiConfigured: boolean }> => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false, aiConfigured: false };
    const hasAddon = await hasContractSnapAddon(userId);
    return {
      configured: true,
      hasAddon,
      aiConfigured: !!process.env.OPENAI_API_KEY,
    };
  },
);

export const listContracts = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireContractSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, contracts: [] };
  const rows = (await sql`
    SELECT id, title, contract_type, effective_date, expiration_date, renewal_date,
           cancellation_deadline, auto_renewal, renewal_type, analysis_status, status, created_at
    FROM contracts
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, contracts: rows.map(toRow) };
});

export const getContract = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid contract id.");
    return { id };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    await requireContractSnapAddon(userId);
    if (!process.env.DATABASE_URL) return { configured: false, contract: null };
    const rows = (await sql`
      SELECT c.id, c.title, c.contract_type, c.effective_date, c.expiration_date,
             c.renewal_date, c.cancellation_deadline, c.auto_renewal, c.renewal_type,
             c.analysis_status, c.status, c.created_at, c.source_text, c.original_file_ref,
             c.summary
      FROM contracts c
      WHERE c.id = ${opts.data.id} AND c.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return { configured: true, contract: null };

    const [clauseRows, eventRows, reminderRows] = await Promise.all([
      sql`
        SELECT id, type, text, location, confidence, source_status
        FROM contract_clauses WHERE contract_id = ${opts.data.id} ORDER BY id
      `,
      sql`
        SELECT id, event_type, date, source FROM contract_events
        WHERE contract_id = ${opts.data.id} ORDER BY id
      `,
      sql`
        SELECT id, type, due_date, delivered FROM contract_reminders
        WHERE contract_id = ${opts.data.id} ORDER BY id
      `,
    ]);

    let extraction: ContractExtraction | null = null;
    const summaryRaw = r.summary;
    if (summaryRaw && String(summaryRaw) !== "{}" && String(summaryRaw) !== "null") {
      try {
        extraction = normalizeExtraction(JSON.parse(String(summaryRaw)), r.title as string);
      } catch {
        extraction = null;
      }
    }
    // Merge DB-assigned ids + persisted rows (clauses/events/reminders) into extraction.
    if (extraction) {
      extraction.title = asString(r.title) ?? extraction.title;
      extraction.clauses = (clauseRows as Record<string, unknown>[]).map((c) => ({
        id: Number(c.id),
        type: asString(c.type) ?? "clause",
        text: asString(c.text) ?? "",
        location: asString(c.location),
        confidence: c.confidence == null ? 0 : Number(c.confidence),
        source_status: asSourceStatus(c.source_status),
      }));
      extraction.events = (eventRows as Record<string, unknown>[]).map((e) => ({
        id: Number(e.id),
        event_type: asString(e.event_type) ?? "other",
        date: asString(e.date),
        source: asString(e.source) ?? "interpreted",
      }));
      extraction.reminders = (reminderRows as Record<string, unknown>[]).map((x) => ({
        id: Number(x.id),
        type: asString(x.type) ?? "renewal",
        due_date: asString(x.due_date),
        delivered: x.delivered === true,
      }));
    }

    const contract: ContractDetail = {
      ...toRow(r),
      created_at: r.created_at == null ? null : String(r.created_at),
      sourceText: String(r.source_text ?? ""),
      original_file_ref: asString(r.original_file_ref),
      extraction,
    };
    return { configured: true, contract };
  });

/**
 * Create a contract from its raw (extracted) source text. Runs AI extraction
 * when OPENAI_API_KEY is set and persists the full record (contract + clauses +
 * events + reminders). When the key is absent it DEGRADES GRACEFULLY: the
 * contract is still recorded with its source text and analysis_status='pending'
 * so the flow is runnable end-to-end without the key. When DATABASE_URL is
 * absent, sql() no-ops and the contract is returned session-only.
 */
export const createContract = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { title?: unknown; sourceText?: unknown; fileRef?: unknown };
    const title = typeof d.title === "string" ? d.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
    const sourceText = typeof d.sourceText === "string" ? d.sourceText : "";
    if (sourceText.trim().length < 20) {
      throw new Error("Please upload a contract with at least a few lines of readable text.");
    }
    if (sourceText.length > MAX_TEXT_LENGTH) {
      throw new Error("That contract is too long to analyze. Please upload a smaller PDF.");
    }
    const fileRef = typeof d.fileRef === "string" ? d.fileRef.trim().slice(0, 300) : "";
    return { title, sourceText: sourceText.trim(), fileRef };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    await requireContractSnapAddon(userId);
    const aiConfigured = !!process.env.OPENAI_API_KEY;

    let extraction: ContractExtraction | null = null;
    let analysisStatus = "pending";
    let aiError: string | null = null;
    if (aiConfigured) {
      try {
        extraction = await extractWithAI(opts.data.sourceText, opts.data.title);
        analysisStatus = "complete";
      } catch (err) {
        analysisStatus = "pending";
        aiError = err instanceof Error ? err.message : "AI extraction failed.";
      }
    } else {
      aiError = "pending — AI not connected";
    }

    if (!process.env.DATABASE_URL) {
      // Session-only demo path (sql() no-ops). Show the extraction if we made one.
      return {
        configured: false,
        aiConfigured,
        analysisStatus,
        aiError,
        contract: {
          id: 0,
          title: opts.data.title || (extraction?.title ?? "Untitled contract"),
          contract_type: extraction?.contract_type ?? null,
          effective_date: extraction?.effective_date
            ? asDateFromFact(extraction.effective_date)
            : null,
          expiration_date: asDateFromFact(extraction?.expiration_date),
          renewal_date: asDateFromFact(extraction?.renewal_date),
          cancellation_deadline: asDateFromFact(extraction?.cancellation_deadline),
          auto_renewal: extraction?.auto_renewal?.value == null
            ? null
            : extraction.auto_renewal.value === true,
          renewal_type: extraction?.renewal_type ?? null,
          analysis_status: analysisStatus,
          status: "analyzed",
          created_at: null,
          sourceText: opts.data.sourceText,
          original_file_ref: opts.data.fileRef || null,
          extraction,
        } as ContractDetail,
      };
    }

    const title = opts.data.title || extraction?.title || "Untitled contract";
    const insert = (await sql`
      INSERT INTO contracts (
        clerk_user_id, title, contract_type, effective_date, expiration_date,
        renewal_date, cancellation_deadline, renewal_type, auto_renewal,
        status, original_file_ref, source_text, summary, analysis_status
      ) VALUES (
        ${userId}, ${title}, ${extraction?.contract_type ?? null},
        ${asDateFromFact(extraction?.effective_date)}, ${asDateFromFact(extraction?.expiration_date)},
        ${asDateFromFact(extraction?.renewal_date)}, ${asDateFromFact(extraction?.cancellation_deadline)},
        ${extraction?.renewal_type ?? null},
        ${extraction?.auto_renewal?.value == null ? null : extraction.auto_renewal.value === true},
        'analyzed', ${opts.data.fileRef || null}, ${opts.data.sourceText},
        ${extraction ? JSON.stringify(extraction) : "{}"}::jsonb, ${analysisStatus}
      )
      RETURNING id
    `) as Record<string, unknown>[];
    const contractId = Number(insert[0]?.id);

    if (contractId > 0 && extraction) {
      for (const c of extraction.clauses) {
        await sql`
          INSERT INTO contract_clauses (contract_id, type, text, location, confidence, source_status)
          VALUES (${contractId}, ${c.type}, ${c.text}, ${c.location}, ${c.confidence}, ${c.source_status})
        `;
      }
      for (const e of extraction.events) {
        await sql`
          INSERT INTO contract_events (contract_id, event_type, date, source)
          VALUES (${contractId}, ${e.event_type}, ${e.date}, ${e.source})
        `;
      }
      for (const x of extraction.reminders) {
        await sql`
          INSERT INTO contract_reminders (contract_id, type, due_date, delivered)
          VALUES (${contractId}, ${x.type}, ${x.due_date}, ${x.delivered})
        `;
      }
    }

    const contract: ContractDetail = {
      id: contractId,
      title,
      contract_type: extraction?.contract_type ?? null,
      effective_date: asDateFromFact(extraction?.effective_date),
      expiration_date: asDateFromFact(extraction?.expiration_date),
      renewal_date: asDateFromFact(extraction?.renewal_date),
      cancellation_deadline: asDateFromFact(extraction?.cancellation_deadline),
      auto_renewal: extraction?.auto_renewal?.value == null ? null : extraction.auto_renewal.value === true,
      renewal_type: extraction?.renewal_type ?? null,
      analysis_status: analysisStatus,
      status: "analyzed",
      created_at: new Date().toISOString(),
      sourceText: opts.data.sourceText,
      original_file_ref: opts.data.fileRef || null,
      extraction,
    };
    return { configured: true, aiConfigured, analysisStatus, aiError, contract };
  });

/**
 * Parse the extraction back out of the persisted `summary` JSONB column so
 * search can span every structured field (phrases, clauses, parties, dates,
 * payment, obligations) — not just the top-level row columns.
 */
export function parseStoredExtraction(summaryRaw: unknown, title: string): ContractExtraction | null {
  if (summaryRaw == null) return null;
  const s = String(summaryRaw);
  if (s === "{}" || s === "null" || s.trim() === "") return null;
  try {
    return normalizeExtraction(JSON.parse(s), title);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Natural-language search                                             */
/* ------------------------------------------------------------------ */
/**
 * Short, high-frequency words stripped from a natural-language query. Whatever
 * is left becomes the "substantive" terms we actually score against.
 */
const SEARCH_STOPWORDS = new Set([
  "which", "who", "what", "when", "where", "why", "how", "the", "a", "an",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "i", "me", "my", "mine", "we", "our", "ours", "us", "you", "your", "yours",
  "they", "them", "their", "it", "its", "of", "to", "in", "on", "at", "for",
  "with", "and", "or", "that", "this", "these", "those", "will", "would", "can",
  "could", "should", "shall", "have", "has", "had", "about", "from", "by", "as",
  "all", "any", "some", "get", "gets", "show", "find", "list", "tell", "me",
  // domain boilerplate that shouldn't gate a search
  "contract", "contracts", "agreement", "agreements", "documents", "document",
  "docs", "doc", "paperwork", "module", "lets", "let", "there", "their", "them",
  "than", "then", "also", "into", "each", "more", "most", "other", "such",
]);

/**
 * Synonym expansions turn informal phrasings into the vocabulary that actually
 * appears in a stored contract ("end" -> "expiration", "paying" -> "payment/money",
 * "auto" -> "automatic"). Spaces delimit alternatives; each is checked as a
 * loose substring against the contract's search corpus.
 */
const SEARCH_ALIASES: Record<string, string> = {
  end: " expiration expires expire ending expirationdate ",
  expire: " expiration expires expire ending end expirationdate ",
  expires: " expiration expires expire ending ",
  expiring: " expiration expires expire ",
  expiration: " expiration expires expire expiry ending ",
  renew: " renewal renews renew ",
  renewal: " renewal renews renew auto ",
  renews: " renewal renews renew ",
  renewed: " renewal renews renew ",
  auto: " auto automatic automatically autorenewal autorenews ",
  automatic: " auto automatic automatically autorenewal ",
  pay: " payment pay paying price cost charge billed fees ",
  paying: " payment pay paying price cost charge fees ",
  paid: " payment pay price cost fees ",
  price: " payment price pay cost charge ",
  cost: " payment cost price pay charge ",
  charge: " payment charge charged fees bills ",
  charges: " payment charge fees bills ",
  bill: " payment bill billed charges fees ",
  bills: " payment bill billed fees ",
  fees: " fees payment charges ",
  monthly: " monthly month ",
  yearly: " yearly year annually annual ",
  annual: " annual yearly annually peryear ",
  paymonthly: " monthly month payment ",
};

/** Tokenize a natural-language query into substantive search terms. */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[\u2014\u2013]/g, " ") // em/en dash -> space
    .replace(/[^a-z0-9$€£%.,+\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/[\s,.]+/)
    .filter((t) => t.length > 1 && !SEARCH_STOPWORDS.has(t));
}

/**
 * Build one big lowercase text blob per contract that covers every field we
 * want natural-language search to reach: title, dates, renewal behaviour,
 * payment, obligations, the AI summary, clauses, timeline events, reminders.
 */
export function buildSearchCorpus(row: Record<string, unknown>, extraction: ContractExtraction | null): string {
  const p: string[] = [];
  const push = (v: unknown) => {
    const s = v == null ? "" : String(v).trim();
    if (s) p.push(s);
  };
  push(row.title);
  push(row.contract_type);
  push(row.effective_date);
  push(row.expiration_date);
  push(row.renewal_date);
  push(row.cancellation_deadline);
  push(row.renewal_type);
  if (row.auto_renewal === true) p.push("auto automatic renewal renews autorenewal");
  if (row.auto_renewal === false) p.push("manual renewal does not auto renew");
  if (extraction) {
    for (const party of extraction.parties) {
      push(party.name);
      push(party.role);
    }
    push(extraction.fees);
    push(extraction.deposits);
    push(extraction.penalties);
    push(extraction.jurisdiction);
    push(extraction.payment?.amount);
    push(extraction.payment?.currency);
    push(extraction.payment?.frequency);
    push(extraction.cancellation_window_days?.value);
    push(extraction.notice_period_days?.value);
    for (const f of [
      extraction.effective_date,
      extraction.expiration_date,
      extraction.renewal_date,
      extraction.cancellation_deadline,
    ]) {
      if (f?.value != null && f.value !== "") push(String(f.value));
    }
    for (const o of extraction.major_obligations) push(o);
    const s = extraction.summary;
    push(s.what_this_contract_does);
    push(s.what_you_pay);
    push(s.what_you_must_do);
    push(s.what_they_must_do);
    for (const d of s.important_dates) push(d);
    for (const w of s.watch_out_for) push(w);
    for (const c of extraction.clauses) push(`${c.type} ${c.text}`);
    for (const e of extraction.events) push(`${e.event_type} ${e.date}`);
    for (const m of extraction.reminders) push(`${m.type} ${m.due_date}`);
  }
  return p.join(" ").toLowerCase();
}

/** Expand each query term (plus synonyms) into a list of loose substrings. */
export function expandTerms(terms: string[]): { raw: string; needles: string[] }[] {
  return terms.map((raw) => {
    const aliased = (SEARCH_ALIASES[raw] ?? "").split(/\s+/).filter(Boolean);
    return { raw, needles: [raw, ...aliased] };
  });
}

/** Loose substring scoring: stronger for longer / more specific terms. */
export function scoreCorpus(corpus: string, terms: { raw: string; needles: string[] }[]): number {
  let score = 0;
  for (const t of terms) {
    if (t.needles.some((n) => n.length > 1 && corpus.includes(n))) {
      score += Math.max(2, t.raw.length);
    }
  }
  return score;
}

/**
 * True when EVERY substantive query term matches the corpus. Requiring all
 * terms keeps natural-language questions precise ("what am I paying monthly?"
 * returns only monthly obligations, not every contract that mentions payment).
 */
export function allTermsMatch(corpus: string, terms: { raw: string; needles: string[] }[]): boolean {
  return terms.every((t) => t.needles.some((n) => n.length > 1 && corpus.includes(n)));
}

/** A short reason for why a contract matched, for the result card. */
function reasonFor(terms: { raw: string; needles: string[] }[], corpus: string, row: ContractRow): string {
  const matched = terms.filter((t) => t.needles.some((n) => n.length > 1 && corpus.includes(n)));
  const titleHit = terms.some((t) => (row.title || "").toLowerCase().includes(t.raw));
  if (titleHit) return "Matches the contract title.";
  if (matched.length) {
    const shown = matched.map((m) => `"${m.raw}"`).slice(0, 3).join(", ");
    return `Matches ${shown} in its content, dates, clauses, or summary.`;
  }
  return "Included in the current view.";
}

/**
 * Small capacity-bounded AI prompt so gpt-4o-mini (16k context) is never
 * overloaded even when a user's library is large.
 */
const MAX_AI_CONTRACTS = 8;
const MAX_AI_CONTEXT_CHARS = 7000;

function compactContextForAI(hits: { row: ContractRow; extraction: ContractExtraction | null }[]): string {
  const blocks: string[] = [];
  for (const { row, extraction } of hits) {
    const lines: string[] = [];
    lines.push(`- Contract: ${row.title}`);
    if (row.contract_type) lines.push(`  type: ${row.contract_type}`);
    if (row.effective_date) lines.push(`  effective: ${row.effective_date}`);
    if (row.expiration_date) lines.push(`  expires: ${row.expiration_date}`);
    if (row.renewal_date) lines.push(`  renewal: ${row.renewal_date}`);
    if (row.cancellation_deadline) lines.push(`  cancellation deadline: ${row.cancellation_deadline}`);
    lines.push(`  auto-renews: ${row.auto_renewal === true ? "yes" : row.auto_renewal === false ? "no" : "unknown"}`);
    if (row.renewal_type) lines.push(`  renewal type: ${row.renewal_type}`);
    if (extraction) {
      if (extraction.payment?.amount != null) {
        lines.push(
          `  payment: ${extraction.payment.currency ?? ""} ${extraction.payment.amount}${extraction.payment.frequency ? ` ${extraction.payment.frequency}` : ""}`,
        );
      }
      if (extraction.summary.what_this_contract_does) lines.push(`  summary: ${extraction.summary.what_this_contract_does}`);
      if (extraction.summary.what_you_pay) lines.push(`  you pay: ${extraction.summary.what_you_pay}`);
      if (extraction.major_obligations.length) lines.push(`  obligations: ${extraction.major_obligations.join("; ")}`);
      const clauses = extraction.clauses.map((c) => `${c.type}: ${c.text}`).slice(0, 4);
      if (clauses.length) lines.push(`  clauses: ${clauses.join(" | ")}`);
    }
    blocks.push(lines.join("\n"));
  }
  const joined = blocks.join("\n\n");
  return joined.length > MAX_AI_CONTEXT_CHARS ? joined.slice(0, MAX_AI_CONTEXT_CHARS) : joined;
}

const SEARCH_ANSWER_PROMPT = `You answer a user's question about THEIR OWN saved contracts, using ONLY the contract data provided (never invent facts). Be concise, specific and truthful.

RULES:
- If the question asks for a list (e.g. "which contracts auto-renew?", "what am I paying monthly?", "which contracts end in 2026?"), answer with exactly which contracts qualify, naming each by its title, and the relevant detail (date / amount / reason).
- If the data does not say, say "I couldn't determine that from your contracts" — do not guess.
- Keep the answer to 1-4 short sentences. It is informational, not legal advice.
- Return STRICT JSON only: {"answer": string, "matched_titles": string[]}
  where matched_titles lists the titles of the contracts your answer relies on.`;

async function answerSearchQuestion(query: string, context: string): Promise<string | null> {
  try {
    const parsed = await openAiJson(
      SEARCH_ANSWER_PROMPT,
      `Question: ${query}\n\nYour contracts (from the user's own library):\n\n${context}`,
    );
    const answer = asString(parsed.answer);
    return answer;
  } catch {
    // AI is best-effort on top of deterministic results — never block a search.
    return null;
  }
}

export const searchContracts = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { query?: unknown };
    if (typeof d.query !== "string" || d.query.trim().length === 0) {
      throw new Error("Enter a search term.");
    }
    return { query: d.query.trim().slice(0, 200) };
  })
  .handler(async (opts): Promise<ContractSearchResponse> => {
    const userId = await requireServerFunctionUser();
    await requireContractSnapAddon(userId);
    const aiConfigured = !!process.env.OPENAI_API_KEY;
    if (!process.env.DATABASE_URL) return { configured: false, aiConfigured, aiAnswer: null, contracts: [] };

    const rows = (await sql`
      SELECT id, title, contract_type, effective_date, expiration_date, renewal_date,
             cancellation_deadline, auto_renewal, renewal_type, analysis_status, status, created_at,
             summary
      FROM contracts
      WHERE clerk_user_id = ${userId}
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];

    // Deterministic layer: score each contract against the natural-language query.
    const candidates = rows.map((r) => {
      const row = toRow(r);
      const extraction = parseStoredExtraction(r.summary, row.title);
      return { row, extraction, corpus: buildSearchCorpus(r, extraction) };
    });

    const terms = expandTerms(searchTerms(opts.data.query));
    const autoIntent =
      searchTerms(opts.data.query).includes("auto") ||
      searchTerms(opts.data.query).includes("automatic") ||
      searchTerms(opts.data.query).includes("autoer");

    let hits: { row: ContractRow; extraction: ContractExtraction | null; corpus: string; score: number }[];
    if (terms.length === 0) {
      // No substantive terms ("show me my contracts") -> keep everything, score 0.
      hits = candidates.map((c) => ({ ...c, score: 0 }));
    } else {
      hits = [];
      for (const c of candidates) {
        // "auto" questions are almost always about auto-RENEWAL, so require the
        // contract to actually auto-renew rather than matching the words alone.
        if (autoIntent && !(c.row.auto_renewal === true)) continue;
        if (!allTermsMatch(c.corpus, terms)) continue;
        hits.push({ ...c, score: scoreCorpus(c.corpus, terms) });
      }
    }

    hits.sort(
      (a, b) =>
        b.score - a.score ||
        String(b.row.created_at ?? "").localeCompare(String(a.row.created_at ?? "")),
    );
    const top = hits.slice(0, 25);

    const contracts = top.map((h) => {
      const titleHit = terms.some((t) => (h.row.title || "").toLowerCase().includes(t.raw));
      return {
        ...h.row,
        matchedOn: titleHit ? ("title" as const) : ("content" as const),
        score: h.score,
        matchReason: reasonFor(terms, h.corpus, h.row),
      };
    });

    // AI layer: synthesize a short answer from the top matches, when available.
    let aiAnswer: string | null = null;
    if (aiConfigured && contracts.length > 0) {
      const contextHits = top.slice(0, MAX_AI_CONTRACTS);
      aiAnswer = await answerSearchQuestion(
        opts.data.query,
        compactContextForAI(contextHits.map(({ row, extraction }) => ({ row, extraction }))),
      );
    }

    return { configured: true, aiConfigured, aiAnswer, contracts };
  });

export const deleteContract = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid contract id.");
    return { id };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    await requireContractSnapAddon(userId);
    if (!process.env.DATABASE_URL) throw new Error("Storage isn't connected yet.");
    const rows = (await sql`
      DELETE FROM contracts WHERE id = ${opts.data.id} AND clerk_user_id = ${userId}
      RETURNING id
    `) as Record<string, unknown>[];
    return { configured: true, ok: rows.length > 0 };
  });
