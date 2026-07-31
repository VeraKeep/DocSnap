/**
 * documentCategorizer.ts
 * Client-side document categorization engine.
 *
 * Reads OCR text from scanned documents and automatically assigns them
 * to one of seven categories using keyword matching.
 *
 * Zero dependencies — pure TypeScript, runs in-browser.
 *
 * Phase: 5a — Document categorization engine
 */

// ── Types ──────────────────────────────────────────────────────────

export interface CategorizationResult {
  /** The winning category, or "Uncategorized" if no category dominates */
  category: string;
  /** Confidence score 0-1. 0 for "Uncategorized" */
  confidence: number;
  /** All category raw match scores (for debugging / UI) */
  scores: Record<string, number>;
}

// ── Category keyword map ───────────────────────────────────────────

/**
 * Keywords per category.
 * Each string is a phrase (single-word or multi-word).
 * Multi-word phrases receive bonus weight during scoring.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Receipts: [
    "receipt",
    "total",
    "subtotal",
    "tax",
    "change due",
    "cash",
    "credit card",
    "debit",
    "payment",
    "item",
    "qty",
    "quantity",
    "price",
    "amount due",
    "sale",
    "purchase",
    "thank you for your",
    "register",
    "terminal",
    "tendered",
    "balance due",
    "discount",
    "void",
    "merchant",
    "authorization",
    "transaction",
    "invoice",
    "tip",
    "gratuity",
    "order number",
    "checkout",
    "pos",
    "vat",
    "service charge",
    "dining",
    "takeout",
  ],
  Insurance: [
    "policy",
    "claim",
    "coverage",
    "premium",
    "deductible",
    "insured",
    "beneficiary",
    "underwriter",
    "liability",
    "insurance",
    "policyholder",
    "coverage limit",
    "declarations page",
    "binder",
    "endorsement",
    "rider",
    "actuary",
    "indemnity",
    "subrogation",
    "loss payee",
    "named insured",
    "effective date",
    "expiration date",
    "term life",
    "whole life",
    "annuity",
    "broker",
    "p&c",
    "property damage",
    "bodily injury",
    "umbrella",
  ],
  Taxes: [
    "w-2",
    "1099",
    "tax return",
    "irs",
    "internal revenue",
    "deduction",
    "filing",
    "taxable",
    "withholding",
    "schedule c",
    "form 1040",
    "tax year",
    "adjusted gross",
    "exemption",
    "dependents",
    "social security",
    "medicare",
    "estimated tax",
    "refund",
    "overpayment",
    "underpayment",
    "audit",
    "k-1",
    "1098",
    "w-4",
    "eitc",
    "earned income credit",
    "capital gain",
    "dividend",
    "interest income",
    "filing status",
    "standard deduction",
    "itemized deduction",
    "tax preparer",
    "pin",
    "e-file",
  ],
  Medical: [
    "patient",
    "diagnosis",
    "prescription",
    "physician",
    "hospital",
    "clinic",
    "medical",
    "pharmacy",
    "dosage",
    "rx",
    "health",
    "lab results",
    "referring",
    "appointment",
    "provider",
    "copay",
    "deductible",
    "eob",
    "explanation of benefits",
    "cpt",
    "icd",
    "hcpcs",
    "primary care",
    "specialist",
    "radiology",
    "mri",
    "x-ray",
    "ultrasound",
    "blood test",
    "urinalysis",
    "immunization",
    "vaccine",
    "surgery",
    "procedure",
    "discharge summary",
    "follow-up",
    "referral",
    "prior authorization",
    "medication",
    "pill",
    "capsule",
    "tablet",
    "refill",
  ],
  School: [
    "university",
    "college",
    "transcript",
    "tuition",
    "semester",
    "grade",
    "gpa",
    "course",
    "enrollment",
    "degree",
    "student",
    "academic",
    "financial aid",
    "registrar",
    "bachelor",
    "master",
    "doctorate",
    "phd",
    "associate",
    "certificate",
    "scholarship",
    "grant",
    "bursar",
    "syllabus",
    "curriculum",
    "credit hour",
    "prerequisite",
    "elective",
    "major",
    "minor",
    "undergraduate",
    "graduate",
    "faculty",
    "professor",
    "dean",
    "honor roll",
    "probation",
    "dorm",
    "residence hall",
    "campus",
  ],
  Military: [
    "veteran",
    "dd-214",
    "service member",
    "discharge",
    "command",
    "enlisted",
    "rank",
    "deployment",
    "dod",
    "department of defense",
    "va",
    "veterans affairs",
    "separation",
    "dd214",
    "navy",
    "army",
    "air force",
    "marines",
    "coast guard",
    "national guard",
    "reserve",
    "active duty",
    "honorable discharge",
    "general discharge",
    "mos",
    "military occupational specialty",
    "afsc",
    "rating",
    "pcs",
    "tdy",
    "orders",
    "base",
    "post",
    "fort",
    "naval",
    "pentagon",
    "tricare",
    "gi bill",
    "post-9/11",
    "commissary",
    "px",
    "nex",
  ],
  Manuals: [
    "manual",
    "instructions",
    "setup",
    "warranty",
    "user guide",
    "installation",
    "troubleshooting",
    "specifications",
    "assembly",
    "operating",
    "quick start",
    "safety",
    "product guide",
    "owner's manual",
    "owners manual",
    "instruction manual",
    "getting started",
    "configuration",
    "maintenance",
    "care",
    "cleaning",
    "parts list",
    "diagram",
    "faq",
    "regulatory",
    "compliance",
    "caution",
    "warning",
    "disclaimer",
    "technical support",
    "customer service",
    "helpline",
    "model",
    "serial number",
    "accessories",
    "compatibility",
    "fcc",
    "ce mark",
    "rohs",
  ],
};

/** All valid category names */
const CATEGORY_NAMES = Object.keys(CATEGORY_KEYWORDS);

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Get the word count of a phrase (for weighting multi-word matches).
 */
function phraseWeight(phrase: string): number {
  const words = phrase.trim().split(/\s+/).length;
  if (words >= 4) return 4;
  if (words >= 3) return 3;
  if (words >= 2) return 2;
  return 1;
}

/**
 * Count matches of a keyword/phrase in the normalized text.
 * Uses a simple index-based scan to avoid overlapping/duplicate matches.
 */
function countMatches(text: string, keyword: string): number {
  let count = 0;
  let pos = 0;
  while (true) {
    pos = text.indexOf(keyword, pos);
    if (pos === -1) break;
    count++;
    pos += keyword.length;
  }
  return count;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Categorize OCR-extracted text into one of seven document categories.
 *
 * Algorithm:
 * 1. Normalize input (lowercase, trim, collapse whitespace)
 * 2. For each category, score = sum(matchCount * phraseWeight) for each keyword
 * 3. Confidence = topScore / totalScore (0 if no matches)
 * 4. If top confidence < 0.15, return "Uncategorized"
 *
 * @param ocrText - Raw OCR text extracted from document
 * @returns CategorizationResult with winning category, confidence, and all scores
 */
export function categorizeDocument(ocrText: string): CategorizationResult {
  const normalized = ocrText.toLowerCase().trim().replace(/\s+/g, " ");

  const scores: Record<string, number> = {};
  let totalScore = 0;

  for (const category of CATEGORY_NAMES) {
    let categoryScore = 0;
    const keywords = CATEGORY_KEYWORDS[category];

    for (const keyword of keywords) {
      const matches = countMatches(normalized, keyword.toLowerCase());
      if (matches > 0) {
        categoryScore += matches * phraseWeight(keyword);
      }
    }

    scores[category] = categoryScore;
    totalScore += categoryScore;
  }

  if (totalScore === 0) {
    return { category: "Uncategorized", confidence: 0, scores };
  }

  // Find the top category
  let topCategory = CATEGORY_NAMES[0];
  let topScore = scores[topCategory];

  for (const category of CATEGORY_NAMES) {
    if (scores[category] > topScore) {
      topScore = scores[category];
      topCategory = category;
    }
  }

  const confidence = topScore / totalScore;

  if (confidence < 0.15) {
    return { category: "Uncategorized", confidence: 0, scores };
  }

  return { category: topCategory, confidence, scores };
}

/**
 * Return the full keyword map used by the categorizer.
 * Useful for the search feature (Phase 5c groundwork) — allows
 * filtering/searching by category keywords.
 */
export function getCategoryKeywords(): Record<string, string[]> {
  // Return a shallow copy so callers can't mutate the internal map
  const copy: Record<string, string[]> = {};
  for (const category of CATEGORY_NAMES) {
    copy[category] = [...CATEGORY_KEYWORDS[category]];
  }
  return copy;
}

/**
 * Convenience: extract plain text from OCR word results
 * for use with categorizeDocument().
 */
export function ocrWordsToText(
  words: { text: string }[] | null,
): string {
  if (!words || words.length === 0) return "";
  return words.map((w) => w.text).join(" ");
}
