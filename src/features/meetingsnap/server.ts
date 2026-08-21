/**
 * MeetingSnap module — owner-scoped server functions.
 *
 * Meeting data is personal and scoped to exactly one Clerk user. The owner
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
 * Extraction reuses the exact ReceiptSnap AI pattern: a server-side fetch to
 * the OpenAI chat completions API (model gpt-4o-mini, temperature 0, JSON
 * object response). No key is ever hardcoded; if OPENAI_API_KEY is unset at
 * runtime we surface the same clear, honest message the receipts module uses.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import {
  type MeetingExtraction,
  type MeetingActionItem,
  type MeetingDecision,
  type MeetingQuestion,
  type MeetingRisk,
} from "./types";

/** Hard cap on how much transcript text we'll send to the model. */
const MAX_SOURCE_TEXT_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 200;
const MAX_LISTS = 100;

/* ------------------------------------------------------------------ */
/* Small robust parsing helpers (ported from ReceiptSnap.server)       */
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

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  return String(v).trim() || null;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x) ?? "").filter(Boolean).slice(0, MAX_LISTS);
}

function asBoolean(v: unknown): boolean {
  return v === true || v === "true" || v === "yes";
}

function asPriority(
  v: unknown,
): "high" | "medium" | "low" | "none" | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes("high")) return "high";
  if (s.includes("low")) return "low";
  if (s.includes("none")) return "none";
  if (s.includes("medium") || s.includes("med")) return "medium";
  return null;
}

/**
 * Clamp an arbitrary model-provided value into a 0..1 confidence score.
 * Anything missing, malformed, or out of range is treated conservatively as
 * low confidence (0) so incomplete data is never assumed trustworthy.
 */
export function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/* ------------------------------------------------------------------ */
/* AI extraction + normalization                                       */
/* ------------------------------------------------------------------ */

function normDecision(raw: Record<string, unknown>): MeetingDecision {
  return {
    decision: asString(raw.decision) ?? "Untitled decision",
    reason: asString(raw.reason),
    participants: asStringList(raw.participants),
    confidence: clampConfidence(raw.confidence),
  };
}

function normActionItem(raw: Record<string, unknown>): MeetingActionItem {
  return {
    task: asString(raw.task) ?? "Untitled action item",
    owner: asString(raw.owner),
    priority: asPriority(raw.priority),
    status: asString(raw.status),
    due_date: asString(raw.due_date),
    dependencies: asStringList(raw.dependencies),
    confidence: clampConfidence(raw.confidence),
  };
}

function normQuestion(raw: Record<string, unknown>): MeetingQuestion {
  return {
    question: asString(raw.question) ?? "Untitled question",
    answered: asBoolean(raw.answered),
    confidence: clampConfidence(raw.confidence),
  };
}

function normRisk(raw: Record<string, unknown>): MeetingRisk {
  return {
    description: asString(raw.description) ?? "Untitled risk",
    likelihood: asPriority(raw.likelihood),
    impact: asPriority(raw.impact),
    mitigation: asString(raw.mitigation),
    owner: asString(raw.owner),
    confidence: clampConfidence(raw.confidence),
  };
}

/** Normalize arbitrary model output into the strict MeetingExtraction shape. */
export function normalizeExtraction(raw: unknown): MeetingExtraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    executive_summary: asString(r.executive_summary) ?? "",
    decisions: Array.isArray(r.decisions)
      ? r.decisions
          .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
          .map((d) => normDecision(d))
          .slice(0, MAX_LISTS)
      : [],
    action_items: Array.isArray(r.action_items)
      ? r.action_items
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => normActionItem(a))
          .slice(0, MAX_LISTS)
      : [],
    questions: Array.isArray(r.questions)
      ? r.questions
          .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
          .map((q) => normQuestion(q))
          .slice(0, MAX_LISTS)
      : [],
    risks: Array.isArray(r.risks)
      ? r.risks
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .map((x) => normRisk(x))
          .slice(0, MAX_LISTS)
      : [],
  };
}

/**
 * The "trusted, not just generated" system prompt. The model is told to
 * assign lower confidence to tentative language ("maybe", "probably", "I
 * think", "possibly", "sounds like") so uncertain owners, deadlines, and
 * commitments are flagged rather than assumed.
 */
const SYSTEM_PROMPT = `You extract structured organizational knowledge from meeting transcripts. You are trustworthy, not just fluent: every extracted item carries an explicit confidence score between 0 and 1 reflecting how certain you are that the transcript actually supports it.

Return STRICT JSON only, with exactly these fields:
{
  "executive_summary": string,
  "decisions": [{ "decision": string, "reason": string|null, "participants": string[], "confidence": number }],
  "action_items": [{ "task": string, "owner": string|null, "priority": "high"|"medium"|"low"|null, "status": string|null, "due_date": string|null, "dependencies": string[], "confidence": number }],
  "questions": [{ "question": string, "answered": boolean, "confidence": number }],
  "risks": [{ "description": string, "likelihood": "high"|"medium"|"low"|null, "impact": "high"|"medium"|"low"|null, "mitigation": string|null, "owner": string|null, "confidence": number }]
}

CONFIDENCE RULES:
- Assign HIGH confidence (>= 0.85) only for statements stated plainly and directly in the transcript.
- Assign LOWER confidence (below 0.6) whenever the claim is tentative or hedged — e.g. contains "maybe", "probably", "possibly", "I think", "I guess", "sounds like", "hopefully", "perhaps", "we might", "not sure".
- Specifically lower confidence when an OWNER or DUE DATE is uncertain or implied rather than explicitly assigned. An owner inferred from "we should" with no named person is low confidence.
- Use null for fields the transcript does not state; never invent names, dates, or priorities.

Keep executive_summary to a short, plain-language brief of what happened and what matters. Use [] for empty lists. Do not include anything outside this JSON object.`;

async function extractWithAI(sourceText: string, title: string): Promise<MeetingExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Extraction isn't enabled yet — OPENAI_API_KEY is not connected.");
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
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Meeting title: ${title || "(untitled meeting)"}\n\nTranscript:\n${sourceText}`,
        },
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
      `Extraction failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}): ${reason.slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = cleanJson(body.choices?.[0]?.message?.content ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The meeting transcript could not be read as structured data.");
  }
  return normalizeExtraction(parsed);
}

/* ------------------------------------------------------------------ */
/* Server functions                                                    */
/* ------------------------------------------------------------------ */

/** Auth-contract proof: resolves the caller's Clerk user ID, or fails 401. */
export const whoAmI = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  return { userId };
});

/** The signed-in user's saved meetings (titles + dates), newest first. */
export const listMeetings = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  if (!process.env.DATABASE_URL) return { configured: false, meetings: [] };
  const rows = (await sql`
    SELECT m.id, m.title, m.created_at
    FROM meetings m
    WHERE m.clerk_user_id = ${userId}
    ORDER BY m.created_at DESC
  `) as Record<string, unknown>[];
  return {
    configured: true,
    meetings: rows.map((r) => ({
      id: Number(r.id),
      title: String(r.title ?? "Untitled meeting"),
      createdAt: String(r.created_at ?? ""),
    })),
  };
});

/** Full detail for one of the signed-in user's meetings, with its extraction. */
export const getMeeting = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid meeting id.");
    return { id };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, meeting: null };
    const rows = (await sql`
      SELECT m.id, m.title, m.source_text, e.extraction, m.created_at
      FROM meetings m
      LEFT JOIN meeting_extractions e ON e.meeting_id = m.id
      WHERE m.id = ${opts.data.id} AND m.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return { configured: true, meeting: null };
    let extraction: MeetingExtraction;
    try {
      extraction = normalizeExtraction(JSON.parse(String(r.extraction ?? "{}")));
    } catch {
      extraction = normalizeExtraction({});
    }
    return {
      configured: true,
      meeting: {
        id: Number(r.id),
        title: String(r.title ?? "Untitled meeting"),
        sourceText: String(r.source_text ?? ""),
        createdAt: String(r.created_at ?? ""),
        extraction,
      },
    };
  });

/**
 * Analyze a transcript: run AI extraction, persist the original transcript
 * (immutable source) plus the extraction (versioned derived JSON), and return
 * the results for the client to render. Owner comes from the verified session,
 * never the client.
 */
export const analyzeMeeting = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { title?: unknown; sourceText?: unknown };
    const title = typeof d.title === "string" ? d.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
    const sourceText = typeof d.sourceText === "string" ? d.sourceText : "";
    if (sourceText.trim().length < 20) {
      throw new Error("Please paste or upload a transcript with at least a few lines of text.");
    }
    if (sourceText.length > MAX_SOURCE_TEXT_LENGTH) {
      throw new Error("That transcript is too long. Please use one under 200,000 characters.");
    }
    return { title, sourceText: sourceText.trim() };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    const extracted = await extractWithAI(opts.data.sourceText, opts.data.title);
    // Demo path: no DATABASE_URL → sql() no-ops; return a session-only meeting.
    if (!process.env.DATABASE_URL) {
      return {
        configured: false,
        meeting: {
          id: 0,
          title: opts.data.title || "Untitled meeting",
          createdAt: null,
          sourceText: opts.data.sourceText,
          extraction: extracted,
        },
      };
    }
    const insert = (await sql`
      INSERT INTO meetings (clerk_user_id, title, source_text)
      VALUES (${userId}, ${opts.data.title || "Untitled meeting"}, ${opts.data.sourceText})
      RETURNING id
    `) as Record<string, unknown>[];
    const meetingId = Number(insert[0]?.id);
    if (meetingId > 0) {
      await sql`
        INSERT INTO meeting_extractions (meeting_id, extraction)
        VALUES (${meetingId}, ${JSON.stringify(extracted)}::jsonb)
      `;
    }
    return {
      configured: true,
      meeting: {
        id: meetingId,
        title: opts.data.title || "Untitled meeting",
        createdAt: new Date().toISOString(),
        sourceText: opts.data.sourceText,
        extraction: extracted,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Shared OpenAI JSON helper (same pattern as extraction)              */
/* ------------------------------------------------------------------ */

/**
 * Run a chat-completion and return the cleaned, parsed JSON object. Reuses the
 * exact ReceiptSnap pattern (gpt-4o-mini, temperature 0, json_object). Throws
 * with a friendly message when OPENAI_API_KEY is unset or the call fails.
 */
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

/** How much of each meeting (transcript + extraction) to include in AI context. */
const AI_CONTEXT_CHARS = 12_000;
const MAX_ASKS_CONTEXT = 40;

/* ------------------------------------------------------------------ */
/* 1. Search past meetings (per-user, keyword across title/content)    */
/* ------------------------------------------------------------------ */

export const searchMeetings = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { query?: unknown };
    if (typeof d.query !== "string" || d.query.trim().length === 0) {
      throw new Error("Enter a search term.");
    }
    return { query: d.query.trim().slice(0, 200) };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.DATABASE_URL) return { configured: false, meetings: [] };
    const q = `%${opts.data.query}%`;
    const rows = (await sql`
      SELECT m.id, m.title, m.source_text, m.created_at,
             (e.extraction IS NOT NULL AND e.extraction <> 'null'::jsonb) AS has_extraction
      FROM meetings m
      LEFT JOIN meeting_extractions e ON e.meeting_id = m.id
      WHERE m.clerk_user_id = ${userId}
        AND (m.title ILIKE ${q} OR m.source_text ILIKE ${q} OR CAST(e.extraction AS TEXT) ILIKE ${q})
      ORDER BY m.created_at DESC
    `) as Record<string, unknown>[];
    return {
      configured: true,
      meetings: rows.map((r) => ({
        id: Number(r.id),
        title: String(r.title ?? "Untitled meeting"),
        matchedOn: String(r.title ?? "").toLowerCase().includes(opts.data.query.toLowerCase())
          ? "title"
          : "content",
        createdAt: String(r.created_at ?? ""),
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* 2. Ask AI — grounded Q&A over the user's OWN saved meetings         */
/* ------------------------------------------------------------------ */

const ASK_SYSTEM_PROMPT = `You answer questions about a user's saved meeting records. You are honest and grounded, never inventive.

Rules:
- Answer the question using ONLY the meeting records provided in the user message.
- Every claim you make must trace back to one of those meeting records.
- If the records do not contain the answer (or only partial/uncertain information), say so directly and clearly. Do NOT invent facts, names, owners, dates, or commitments.
- Prefer quotes or direct references over paraphrase when the answer is specific.
- When a claim in the source is low-confidence or hedged, flag it as uncertain.

Return STRICT JSON only with exactly these fields:
{
  "answer": string,
  "grounded": boolean,
  "references": [{ "id": number, "title": string }]
}

- "grounded" is true ONLY when the answer is directly supported by the provided records; false when the answer is not in them (in which case say so in the answer).
- "references" lists the meeting id/title pairs that support the answer; empty array if none.
Do not include anything outside this JSON object.`;

export const askAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { question?: unknown };
    const question = typeof d.question === "string" ? d.question.trim() : "";
    if (question.length < 3) throw new Error("Enter a question to ask about your meetings.");
    return { question: question.slice(0, 1000) };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.OPENAI_API_KEY) return { configured: false, result: null };
    if (!process.env.DATABASE_URL) {
      throw new Error("You need saved meetings to ask about them — storage isn't connected yet.");
    }
    const rows = (await sql`
      SELECT m.id, m.title, m.source_text, e.extraction
      FROM meetings m
      LEFT JOIN meeting_extractions e ON e.meeting_id = m.id
      WHERE m.clerk_user_id = ${userId}
      ORDER BY m.created_at ASC
      LIMIT ${MAX_ASKS_CONTEXT}
    `) as Record<string, unknown>[];

    const context = rows
      .map((r) => {
        let extractionText: string;
        try {
          const parsed = JSON.parse(String(r.extraction ?? "{}"));
          extractionText = JSON.stringify(parsed);
        } catch {
          extractionText = String(r.extraction ?? "{}");
        }
        return (
          `[Meeting #${Number(r.id)} — ${String(r.title ?? "Untitled meeting")}]\n` +
          `Transcript:\n${String(r.source_text ?? "").slice(0, AI_CONTEXT_CHARS)}\n\n` +
          `Extraction:\n${extractionText.slice(0, AI_CONTEXT_CHARS)}`
        );
      })
      .join("\n\n---\n\n");

    if (!context.trim()) {
      throw new Error("You don't have any saved meetings to ask about yet — analyze a meeting first.");
    }

    const parsed = await openAiJson(
      ASK_SYSTEM_PROMPT,
      `The user's saved meetings are below.\n\n${context}\n\nQuestion: ${opts.data.question}`,
    );

    const answer = asString(parsed.answer) ?? "";
    const grounded = parsed.grounded === true || parsed.grounded === "true";
    const references = (Array.isArray(parsed.references) ? parsed.references : [])
      .map((x) => {
        const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        const id = typeof rec.id === "number" ? rec.id : Number(rec.id);
        const title = asString(rec.title) ?? "Untitled meeting";
        return { id: Number.isFinite(id) ? id : 0, title };
      })
      .slice(0, 20);

    return {
      configured: true,
      result: { answer, grounded, references },
    };
  });

/* ------------------------------------------------------------------ */
/* 4. Follow-up email DRAFT (never sent automatically)                 */
/* ------------------------------------------------------------------ */

const DRAFT_SYSTEM_PROMPT = `You write professional follow-up email DRAFTS for a meeting's action items. You never send email, and you never invent facts.

Instructions:
- Base the draft ONLY on the open action items provided in the user message.
- Include each open action item (one not done/completed/closed/resolved/shipped/cancelled) with its owner and due date where known.
- If an owner is uncertain or unknown, write "(owner TBC)" instead of guessing a name.
- Match the subject to the meeting title. Keep the body concise, friendly, and professional.
- Never invent owners, tasks, deadlines, or meeting content that is not in the provided data.

Return STRICT JSON only with exactly these fields:
{ "subject": string, "body": string }
Do not include anything outside this JSON object.`;

/** True for action items that are still open (not explicitly finished). */
function isOpenActionItem(item: MeetingActionItem): boolean {
  const s = (item.status ?? "").toLowerCase();
  return !/done|complete|completed|closed|resolved|shipped|cancelled|canceled|not needed/.test(s);
}

export const draftFollowUpEmail = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid meeting id.");
    return { id };
  })
  .handler(async (opts) => {
    const userId = await requireServerFunctionUser();
    if (!process.env.OPENAI_API_KEY) return { configured: false, draft: null, noneOpen: false };
    if (!process.env.DATABASE_URL) return { configured: false, draft: null, noneOpen: false };

    const rows = (await sql`
      SELECT m.id, m.title, e.extraction
      FROM meetings m
      LEFT JOIN meeting_extractions e ON e.meeting_id = m.id
      WHERE m.id = ${opts.data.id} AND m.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) throw new Error("That meeting could not be found.");

    let extraction: MeetingExtraction;
    try {
      extraction = normalizeExtraction(JSON.parse(String(r.extraction ?? "{}")));
    } catch {
      extraction = normalizeExtraction({});
    }

    const openItems = extraction.action_items.filter(isOpenActionItem);
    if (openItems.length === 0) {
      return { configured: true, draft: null, noneOpen: true };
    }

    const payload = {
      meetingTitle: String(r.title ?? "Untitled meeting"),
      openActionItems: openItems.map((a) => ({
        task: a.task,
        owner: a.owner,
        priority: a.priority,
        due_date: a.due_date,
        status: a.status,
        dependencies: a.dependencies,
        confidence: a.confidence,
      })),
    };

    const parsed = await openAiJson(DRAFT_SYSTEM_PROMPT, JSON.stringify(payload));
    return {
      configured: true,
      draft: {
        subject: asString(parsed.subject) ?? `Action items: ${String(r.title ?? "meeting")}`,
        body: asString(parsed.body) ?? "",
      },
      noneOpen: false,
    };
  });
