/**
 * documentNamer.ts
 * Client-side automatic document naming engine.
 *
 * Produces descriptive filename suggestions from OCR text (+ optional
 * category) using pattern matching and heuristics. Zero dependencies,
 * 100% in-browser — no API calls, no network.
 *
 * Strategies (in priority order):
 *   tax       → "[Form Type] - [Year]"                e.g. "W-2 - 2025"
 *   bill      → "[Company] [Bill/Invoice] - [Date]"   e.g. "Verizon Invoice - Aug 6 2026"
 *   receipt   → "[Vendor] Receipt - [Date] - $[Amt]"  e.g. "Lowe's Receipt - Aug 6 2026 - $184.27"
 *   insurance → "[Company] [Type] Insurance Policy - [Year]" e.g. "State Farm Auto Insurance Policy - 2026"
 *   medical   → "[Doctor/Hospital] [Doc Type] - [Date]" e.g. "Mayo Clinic Lab Result - Aug 6 2026"
 *   category  → "[Category] - [Date]"                 e.g. "School - Aug 6 2026"
 *   generic   → "Document - [Date]"                   (the current default fallback)
 *
 * Phase: 5b — Automatic document naming (Pro feature)
 */

// ── Types ──────────────────────────────────────────────────────────

export type NamingKind =
  | "tax"
  | "bill"
  | "receipt"
  | "insurance"
  | "medical"
  | "category"
  | "generic";

export interface DocumentNameSuggestion {
  /** Suggested filename WITHOUT the ".pdf" extension */
  name: string;
  /** Which naming strategy produced the suggestion ("generic" = no smart match) */
  kind: NamingKind;
}

// ── Data tables ────────────────────────────────────────────────────

/** Known merchants/organizations: [lowercase match, display name] */
const KNOWN_ORGS: [string, string][] = [
  // Retail / merchants
  ["home depot", "Home Depot"], ["lowe's", "Lowe's"], ["lowes", "Lowe's"],
  ["walmart", "Walmart"], ["sam's club", "Sam's Club"], ["sams club", "Sam's Club"],
  ["costco", "Costco"], ["target", "Target"], ["best buy", "Best Buy"],
  ["trader joe's", "Trader Joe's"], ["trader joes", "Trader Joe's"],
  ["whole foods", "Whole Foods"], ["kroger", "Kroger"], ["safeway", "Safeway"],
  ["aldi", "Aldi"], ["publix", "Publix"], ["wegmans", "Wegmans"], ["meijer", "Meijer"],
  ["heb", "HEB"], ["dollar general", "Dollar General"], ["dollar tree", "Dollar Tree"],
  ["walgreens", "Walgreens"], ["cvs", "CVS"], ["rite aid", "Rite Aid"],
  ["starbucks", "Starbucks"], ["mcdonald's", "McDonald's"], ["mcdonalds", "McDonald's"],
  ["burger king", "Burger King"], ["wendy's", "Wendy's"], ["taco bell", "Taco Bell"],
  ["chipotle", "Chipotle"], ["subway", "Subway"], ["domino's", "Domino's"],
  ["dominos", "Domino's"], ["pizza hut", "Pizza Hut"], ["panera", "Panera"],
  ["dunkin", "Dunkin'"], ["7-eleven", "7-Eleven"], ["seven eleven", "7-Eleven"],
  ["shell", "Shell"], ["chevron", "Chevron"], ["exxon", "Exxon"],
  ["bp", "BP"], ["marathon", "Marathon"], ["speedway", "Speedway"],
  ["ace hardware", "Ace Hardware"], ["true value", "True Value"],
  ["macy's", "Macy's"], ["nordstrom", "Nordstrom"], ["old navy", "Old Navy"],
  ["ikea", "IKEA"], ["menards", "Menards"], ["tractor supply", "Tractor Supply"],
  ["o'reilly", "O'Reilly"], ["autozone", "AutoZone"], ["advance auto", "Advance Auto"],
  ["petco", "Petco"], ["petsmart", "PetSmart"], ["ulta", "Ulta"],
  ["sephora", "Sephora"], ["gamestop", "GameStop"], ["nike", "Nike"],
  ["adidas", "Adidas"], ["foot locker", "Foot Locker"],
  ["amazon", "Amazon"], ["ebay", "eBay"], ["etsy", "Etsy"],
  // Utilities / telecom / subscriptions
  ["verizon", "Verizon"], ["at&t", "AT&T"], ["att", "AT&T"],
  ["comcast", "Comcast"], ["xfinity", "Xfinity"], ["spectrum", "Spectrum"],
  ["t-mobile", "T-Mobile"], ["tmobile", "T-Mobile"], ["sprint", "Sprint"],
  ["netflix", "Netflix"], ["spotify", "Spotify"], ["hulu", "Hulu"],
  ["disney+", "Disney+"], ["pg&e", "PG&E"], ["pge", "PG&E"],
  ["con edison", "Con Edison"], ["coned", "Con Edison"], ["edison", "Edison"],
  ["duke energy", "Duke Energy"], ["dominion", "Dominion Energy"],
  ["national grid", "National Grid"], ["american water", "American Water"],
  ["waste management", "Waste Management"], ["republic services", "Republic Services"],
  // Banks / credit cards
  ["chase", "Chase"], ["bank of america", "Bank of America"],
  ["wells fargo", "Wells Fargo"], ["capital one", "Capital One"],
  ["citi", "Citi"], ["american express", "American Express"], ["amex", "American Express"],
  ["discover", "Discover"], ["paypal", "PayPal"],
  // Software / tech
  ["adobe", "Adobe"], ["microsoft", "Microsoft"], ["apple", "Apple"],
  ["google", "Google"], ["samsung", "Samsung"], ["sony", "Sony"],
];

/** Insurance companies: [lowercase match, display name] */
const INSURANCE_COMPANIES: [string, string][] = [
  ["state farm", "State Farm"], ["geico", "GEICO"], ["progressive", "Progressive"],
  ["allstate", "Allstate"], ["liberty mutual", "Liberty Mutual"],
  ["nationwide", "Nationwide"], ["usaa", "USAA"], ["farmers", "Farmers"],
  ["travelers", "Travelers"], ["aaa", "AAA"], ["esurance", "Esurance"],
  ["safeco", "Safeco"], ["amica", "Amica"], ["the general", "The General"],
  ["hartford", "The Hartford"], ["metlife", "MetLife"], ["aetna", "Aetna"],
  ["blue cross", "Blue Cross"], ["blue shield", "Blue Shield"],
  ["cigna", "Cigna"], ["humana", "Humana"], ["unitedhealthcare", "UnitedHealthcare"],
  ["united health", "United Health"], ["kaiser", "Kaiser Permanente"],
  ["anthem", "Anthem"], ["principal", "Principal"], ["prudential", "Prudential"],
  ["northwestern mutual", "Northwestern Mutual"], ["transamerica", "Transamerica"],
  ["guardian", "Guardian"], ["massmutual", "MassMutual"],
  ["new york life", "New York Life"], ["oscar health", "Oscar Health"],
  ["boston mutual", "Boston Mutual"], ["country financial", "Country Financial"],
  ["erie insurance", "Erie Insurance"], ["auto-owners", "Auto-Owners"],
  ["root insurance", "Root Insurance"], ["lemonade", "Lemonade"],
];

/** Insurance policy/product types (in priority order) */
const INSURANCE_TYPES: string[] = [
  "commercial auto", "homeowners", "renters", "motorcycle", "umbrella",
  "term life", "whole life", "auto", "home", "car", "life", "health",
  "dental", "vision", "boat", "rv", "flood", "commercial", "property",
];

/** Tax form patterns: [regex, display]. Longest/most specific first. */
const TAX_FORM_PATTERNS: [RegExp, string][] = [
  [/\bW\s?[-–]?\s?2\b/i, "W-2"],
  [/\bW\s?[-–]?\s?4\b/i, "W-4"],
  [/\bW\s?[-–]?\s?9\b/i, "W-9"],
  [/\b1099[-–\s]?(?:int|div|misc|nec|r|g|k|sa|b|cap|divd)\b/i, "1099"],
  [/\b10(?:40|99)\b/i, "1040"],
  [/\b1040[-–\s]?(?:a|ez|sr|nr|es)\b/i, "1040"],
  [/\b1120[-–\s]?s?\b/i, "1120"],
  [/\b1065\b/i, "1065"],
  [/\b1098[-–\s]?(?:e|t)?\b/i, "1098"],
  [/\b5498\b/i, "5498"],
  [/\b8962\b/i, "8962"],
  [/\bschedule\s+c\b/i, "Schedule C"],
  [/\bschedule\s+a\b/i, "Schedule A"],
  [/\bschedule\s+(?:k-1|k)\b/i, "Schedule K-1"],
  [/\b(?:schedule\s+)?k\s?[-–]?\s?1\b/i, "K-1"],
];

/** Medical document types, most specific first */
const MEDICAL_DOC_TYPES: string[] = [
  "explanation of benefits", "discharge summary", "visit summary",
  "medical record", "prior authorization", "treatment plan", "lab results",
  "lab result", "lab report", "test results", "test result", "test report",
  "blood test", "immunization record", "vaccine record", "pathology report",
  "x-ray report", "mri report", "clinical note", "progress note",
  "prescription refill", "prescription", "referral", "immunization",
  "vaccine", "urinalysis", "x-ray", "mri", "ct scan", "ultrasound",
  "pathology", "diagnosis", "medication", "refill", "consultation",
  "eob", "patient statement", "bill", "invoice", "statement", "claim",
];

/** Medical "statement"-like doc types that need a medical context to count */
const MEDICAL_BILL_LIKE = new Set(["bill", "invoice", "statement"]);

/** Signals that a "bill" mention is actually a medical bill */
const MEDICAL_CONTEXT: string[] = [
  "patient", "diagnosis", "prescription", "physician", "hospital", "clinic",
  "medical", "pharmacy", "dosage", "provider", "copay", "eob", "cpt",
  "icd", "doctor", "dr.", "lab", "blood", "referring", "appointment",
  "health care", "healthcare", "medicare", "medicaid",
];

/** Words that should never be treated as a merchant name */
const MERCHANT_STOP_WORDS = new Set([
  "a", "an", "the", "of", "for", "to", "at", "on", "in", "and", "or", "with",
  "by", "from", "store", "st", "no", "number", "date", "time", "receipt",
  "invoice", "order", "total", "subtotal", "tax", "cash", "card", "visa",
  "mastercard", "amex", "register", "terminal", "tendered", "change",
  "amount", "qty", "item", "price", "sale", "www", "tel", "phone", "ph",
  "thank", "you", "your", "visit", "shop", "open", "closed", "mon", "tue",
  "wed", "thu", "fri", "sat", "sun", "am", "pm", "receipts", "inc", "co",
  "llc", "ltd", "corp", "corporation", "store#", "store", "mgr", "manager",
  "cashier", "server", "waiter", "table", "guest", "check", "tips", "tip",
]);

// ── Helpers ────────────────────────────────────────────────────────

/** Remove characters that are unsafe/ugly in filenames. */
function sanitize(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[,\s]+$/g, "")
    .replace(/^[\s,]+/g, "")
    .trim()
    .slice(0, 80);
}

/** "Aug 6 2026" (short month, no comma — filename friendly). */
function formatShortDate(d: Date): string {
  const s = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return s.replace(/,\s*/g, " ");
}

/** Long date used by the current default naming ("August 6, 2026"). */
function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isValidDate(d: Date): boolean {
  return (
    !Number.isNaN(d.getTime()) &&
    d.getMonth() === d.getMonth() &&
    d.getDate() === d.getDate()
  );
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Find the first valid date in the text (by position, not pattern order).
 * Supports MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY, YYYY-MM-DD, "Month DD YYYY",
 * "Mon D, YYYY", "Mon D YYYY". Dates more than 90 days in the future are
 * ignored (they are usually warranty/expiry dates, not document dates).
 */
function parseDate(text: string, now: Date): Date | null {
  const candidates: { date: Date; idx: number }[] = [];

  // MM/DD/YYYY or MM-DD-YY(YY)
  const slashRe = /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-]((?:19|20)\d{2}|\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = slashRe.exec(text)) !== null) {
    const [, mo, day, yr] = m;
    const year = yr.length === 2 ? 2000 + Number(yr) : Number(yr);
    candidates.push({ date: new Date(year, Number(mo) - 1, Number(day)), idx: m.index });
  }

  // YYYY-MM-DD / YYYY/MM/DD
  const isoRe = /\b((?:19|20)\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/g;
  while ((m = isoRe.exec(text)) !== null) {
    const [, yr, mo, day] = m;
    candidates.push({ date: new Date(Number(yr), Number(mo) - 1, Number(day)), idx: m.index });
  }

  // "Month DD YYYY", "Mon D YYYY", "Mon D, YYYY"
  const monthRe =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+(\d{1,2})(?:st|nd|rd|th)?[,\s]+((?:19|20)\d{2})\b/g;
  while ((m = monthRe.exec(text)) !== null) {
    const month = MONTH_NAMES[m[1].toLowerCase().replace(/\.$/, "")];
    if (month) {
      candidates.push({ date: new Date(Number(m[3]), month - 1, Number(m[2])), idx: m.index });
    }
  }

  candidates.sort((a, b) => a.idx - b.idx);

  for (const c of candidates) {
    if (!isValidDate(c.date)) continue;
    const future = c.date.getTime() - now.getTime();
    if (future > 90 * 24 * 60 * 60 * 1000) continue;
    return c.date;
  }
  return null;
}

/** Find any plausible 4-digit year (e.g. for tax/insurance year). */
function findYear(text: string, now: Date): number | null {
  const re = /\b((?:19|20)\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const y = Number(m[1]);
    if (y >= 1990 && y <= now.getFullYear() + 1) return y;
  }
  return null;
}

/** Find a year near a matched token (for form-specific years). */
function yearNear(text: string, token: string, now: Date): number | null {
  const idx = text.toLowerCase().indexOf(token.toLowerCase());
  if (idx === -1) return null;
  const windowText = text.slice(Math.max(0, idx - 60), idx + token.length + 60);
  return findYear(windowText, now);
}

/** Best-guess dollar amount for receipts/invoices. Prefers TOTAL-adjacent amounts. */
function parseAmount(text: string): string | null {
  const clean = (raw: string): string | null => {
    const num = raw.replace(/[$,]/g, "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(num)) return null;
    return `$${Number(num).toFixed(2)}`;
  };

  // "TOTAL: 184.27" / "AMOUNT DUE $184.27" (no $ required after the label)
  const labeled = /(?:grand\s+total|amount\s+due|balance\s+due|total)[:\s]*\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = labeled.exec(text)) !== null) {
    const v = clean(m[1]);
    if (v) return v;
  }

  // Any "$XX.XX" — prefer the last one (receipt totals are usually last)
  const dollar = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g;
  let last: string | null = null;
  while ((m = dollar.exec(text)) !== null) {
    const v = clean(m[1]);
    if (v) last = v;
  }
  return last;
}

/** Title-case an OCR token, handling apostrophes ("MARY'S" → "Mary's", "O'REILLY" → "O'Reilly"). */
function titleCaseWord(word: string): string {
  const w = word.toLowerCase();
  if (w.length === 0) return w;
  if (!w.includes("'")) return w[0].toUpperCase() + w.slice(1);
  const parts = w.split("'");
  const cased = parts.map((p, i) => {
    if (p === "") return p;
    // "o'reilly" → "O'Reilly"; "mary's" → "Mary's"
    if (i === parts.length - 1 && /^s$/.test(p)) return p;
    return p[0].toUpperCase() + p.slice(1);
  });
  return cased.join("'");
}

/**
 * Extract a merchant/company name from the text header.
 * 1. Known-organization match (display-cased) if found near the top.
 * 2. Otherwise walk the leading words and keep a short run that looks
 *    like a proper name.
 */
function extractMerchant(text: string): string | null {
  const lower = text.toLowerCase();
  const head = lower.slice(0, 200);

  // Known orgs — prefer a match early in the document
  let best: { match: string; display: string; idx: number } | null = null;
  for (const [match, display] of KNOWN_ORGS) {
    const idx = head.indexOf(match);
    if (idx !== -1 && (!best || idx < best.idx)) best = { match, display, idx };
  }
  if (best) return best.display;

  // Header-walk heuristic: take the first run of 1–3 alphabetic words
  const beforeThanks = text.split(/thank\s+you/i)[0];
  const words = beforeThanks.split(/\s+/).filter(Boolean);
  const collected: string[] = [];
  const isNameWord = (w: string): boolean =>
    /^[A-Za-z][A-Za-z'&.\-]*$/.test(w) &&
    !MERCHANT_STOP_WORDS.has(w.toLowerCase());

  for (const w of words) {
    const lw = w.toLowerCase();
    if (collected.length === 0 && !isNameWord(w)) continue; // skip leading junk
    if (!isNameWord(w)) break;
    if (MERCHANT_STOP_WORDS.has(lw)) break;
    collected.push(w);
    if (collected.length >= 3) break;
  }

  if (collected.length === 0) return null;
  let name = collected.map(titleCaseWord).join(" ");
  if (name.length > 26) name = name.slice(0, 26).trim();
  return name;
}

/** Look for a medical document type in the text. Returns display label or null. */
function findMedicalDocType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const t of MEDICAL_DOC_TYPES) {
    if (lower.includes(t)) {
      if (t === "eob" || t === "explanation of benefits") return "EOB";
      if (t === "lab results" || t === "lab result") return "Lab Result";
      if (t === "test results" || t === "test result") return "Test Result";
      if (t === "test report") return "Test Report";
      if (t === "lab report") return "Lab Report";
      if (t === "patient statement") return "Statement";
      if (MEDICAL_BILL_LIKE.has(t)) return t === "statement" ? "Statement" : t[0].toUpperCase() + t.slice(1);
      return t
        .split(" ")
        .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
    }
  }
  return null;
}

function hasMedicalContext(text: string): boolean {
  const lower = text.toLowerCase();
  return MEDICAL_CONTEXT.some((k) => lower.includes(k));
}

/** Find an insurance company in the text. Returns display name or null. */
function findInsuranceCompany(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [match, display] of INSURANCE_COMPANIES) {
    if (lower.includes(match)) return display;
  }
  return null;
}

/** Find an insurance policy type (auto, home, life, ...). */
function findInsuranceType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const t of INSURANCE_TYPES) {
    if (lower.includes(t)) return t === "auto" ? "Auto" : t === "home" ? "Home" : t[0].toUpperCase() + t.slice(1);
  }
  return null;
}

/** Detect a tax form. Returns display label or null. */
function findTaxForm(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [re, display] of TAX_FORM_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(lower)) return display;
  }
  return null;
}

/** Map the categorizer's category names onto a friendly singular label. */
function categoryLabel(category: string): string | null {
  const c = category.trim().toLowerCase();
  if (c === "receipts") return "Receipt";
  if (c === "insurance") return "Insurance";
  if (c === "taxes") return "Tax";
  if (c === "medical") return "Medical";
  if (c === "school") return "School";
  if (c === "military") return "Military";
  if (c === "manuals") return "Manual";
  return null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Suggest a descriptive filename for a scanned document.
 *
 * Pure function — no I/O, no network. Runs entirely in the browser.
 *
 * @param ocrText  - Recognized text from the scan (may be empty).
 * @param category - Optional category from categorizeDocument()
 *                   (e.g. "Receipts", "Taxes", "Uncategorized", "").
 * @param now      - Optional reference date (defaults to new Date(); useful for tests).
 * @returns A filename suggestion (no ".pdf" extension) plus the strategy kind.
 */
export function suggestDocumentName(
  ocrText: string,
  category?: string,
  now?: Date,
): DocumentNameSuggestion {
  const text = (ocrText || "").trim();
  const current = now ?? new Date();
  const cat = (category || "").trim();

  if (!text) {
    return { name: `Document - ${formatLongDate(current)}`, kind: "generic" };
  }

  // ── Tax ──────────────────────────────────────────────────────────
  const taxForm = findTaxForm(text);
  if (taxForm || cat === "Taxes") {
    const form = taxForm ?? "Tax Return";
    const year =
      (taxForm ? yearNear(text, taxForm, current) : null) ??
      findYear(text, current) ??
      current.getFullYear();
    return { name: sanitize(`${form} - ${year}`), kind: "tax" };
  }

  // ── Medical ──────────────────────────────────────────────────────
  const medType = findMedicalDocType(text);
  const medContext = hasMedicalContext(text);
  if (medType && (!MEDICAL_BILL_LIKE.has(medType.toLowerCase()) || medContext)) {
    const who = extractMerchant(text);
    const date = parseDate(text, current);
    const dateStr = date ? formatShortDate(date) : formatShortDate(current);
    const isBillLike = MEDICAL_BILL_LIKE.has(medType.toLowerCase());
    if (who && !isBillLike) {
      return { name: sanitize(`${who} ${medType} - ${dateStr}`), kind: "medical" };
    }
    if (isBillLike) {
      return {
        name: sanitize(`${who ? `${who} ` : "Medical "}${medType} - ${dateStr}`),
        kind: "medical",
      };
    }
    return { name: sanitize(`${medType} - ${dateStr}`), kind: "medical" };
  }

  // ── Bill / invoice (before receipt — "amount due"/"invoice" are decisive) ──
  const isBill =
    /\binvoice\b/i.test(text) ||
    /\bstatement\b/i.test(text) ||
    /\bamount\s+due\b/i.test(text) ||
    /\bbilling\s+(?:period|cycle)\b/i.test(text) ||
    /\bcurrent\s+charges\b/i.test(text) ||
    /\baccount\s+number\b/i.test(text) ||
    /\bpayment\s+is\s+due\b/i.test(text);

  if (isBill) {
    const docWord = /\binvoice\b/i.test(text)
      ? "Invoice"
      : /\bstatement\b/i.test(text)
        ? "Statement"
        : "Bill";
    const company = extractMerchant(text);
    const date = parseDate(text, current);
    const dateStr = date ? formatShortDate(date) : formatShortDate(current);
    if (company) {
      return { name: sanitize(`${company} ${docWord} - ${dateStr}`), kind: "bill" };
    }
    return { name: sanitize(`${docWord} - ${dateStr}`), kind: "bill" };
  }

  // ── Receipt ──────────────────────────────────────────────────────
  const isReceipt =
    /\breceipt\b/i.test(text) ||
    /\bthank\s+you\b/i.test(text) ||
    /\btendered\b/i.test(text) ||
    /\bchange\s+due\b/i.test(text) ||
    /\bcashier\b/i.test(text) ||
    (cat === "Receipts" && /\btotal\b/i.test(text));

  if (isReceipt) {
    const vendor = extractMerchant(text);
    const amount = parseAmount(text);
    const date = parseDate(text, current);
    const dateStr = date ? formatShortDate(date) : formatShortDate(current);
    if (vendor && amount) {
      return {
        name: sanitize(`${vendor} Receipt - ${dateStr} - ${amount}`),
        kind: "receipt",
      };
    }
    if (vendor) {
      return { name: sanitize(`${vendor} Receipt - ${dateStr}`), kind: "receipt" };
    }
    if (amount) {
      return { name: sanitize(`Receipt - ${dateStr} - ${amount}`), kind: "receipt" };
    }
    return { name: sanitize(`Receipt - ${dateStr}`), kind: "receipt" };
  }

  // ── Insurance ────────────────────────────────────────────────────
  const insuranceCompany = findInsuranceCompany(text);
  const isPolicyish =
    /\bpolicy\b/i.test(text) ||
    /\bcoverage\b/i.test(text) ||
    /\binsured\b/i.test(text) ||
    /\bdeductible\b/i.test(text) ||
    /\bdeclarations\b/i.test(text) ||
    /\bpremium\b/i.test(text) ||
    /\binsurance\b/i.test(text);

  if (insuranceCompany || cat === "Insurance" || (isPolicyish && /\binsurance\b/i.test(text))) {
    const company = insuranceCompany ?? extractMerchant(text);
    const type = findInsuranceType(text);
    const year = findYear(text, current) ?? current.getFullYear();
    const typeLabel = type ? `${type} ` : "";
    if (company) {
      return {
        name: sanitize(`${company} ${typeLabel}Insurance Policy - ${year}`),
        kind: "insurance",
      };
    }
    return {
      name: sanitize(`${typeLabel}Insurance Policy - ${year}`.trim()),
      kind: "insurance",
    };
  }

  // ── Category fallback ────────────────────────────────────────────
  const label = categoryLabel(cat);
  if (label) {
    const date = parseDate(text, current);
    const dateStr = date ? formatShortDate(date) : formatShortDate(current);
    return { name: sanitize(`${label} - ${dateStr}`), kind: "category" };
  }

  // ── Ultimate fallback ────────────────────────────────────────────
  return { name: `Document - ${formatLongDate(current)}`, kind: "generic" };
}
