/** Client-side detection of dates that are likely expirations, renewals, or deadlines. */
export type ExpirationType = "expiration" | "renewal" | "deadline";
export interface DetectedExpiration { date: Date; label: string; confidence: number; type: ExpirationType }

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const DATE = `(?:\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|${MONTHS}\\s+\\d{1,2}(?:,)?\\s+\\d{4}|\\d{1,2}\\s+${MONTHS}\\s+\\d{4})`;
const triggers: Array<{ re: RegExp; type: ExpirationType; confidence: number }> = [
  { re: new RegExp(`(?:expires?|expiration\\s+date|valid\\s+until|registration\\s+expires|license\\s+expires)\\s*[:#-]?\\s*(${DATE})`, "i"), type: "expiration", confidence: .96 },
  { re: new RegExp(`(?:renew\\s+by|renewal\\s+date)\\s*[:#-]?\\s*(${DATE})`, "i"), type: "renewal", confidence: .96 },
  { re: new RegExp(`(?:due\\s+date|deadline)\\s*[:#-]?\\s*(${DATE})`, "i"), type: "deadline", confidence: .96 },
  { re: new RegExp(`(?:policy\\s+period|term\\s+ends?|exp)\\s*[:#-]?[^\\n]{0,35}?(${DATE})`, "i"), type: "expiration", confidence: .88 },
];

function parseDate(raw: string): Date | null {
  const s = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let d: Date;
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s)) {
    const [m, day, y] = s.split(/[\/-]/).map(Number); const year = y < 100 ? 2000 + y : y;
    d = new Date(year, m - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  } else {
    d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
  }
  return d.getFullYear() >= 2000 && d.getFullYear() <= 2200 ? d : null;
}

export function detectExpirations(text: string): DetectedExpiration[] {
  if (!text?.trim()) return [];
  const found: DetectedExpiration[] = [];
  for (const trigger of triggers) {
    const match = trigger.re.exec(text);
    if (!match) continue;
    const date = parseDate(match[1]);
    if (!date || found.some((x) => x.date.getTime() === date.getTime())) continue;
    const start = Math.max(0, match.index - 12);
    const label = text.slice(start, match.index + match[0].length).replace(/\s+/g, " ").trim().slice(0, 100);
    found.push({ date, label: label || "Expiration date", confidence: trigger.confidence, type: trigger.type });
  }
  return found.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function formatExpirationDate(date: Date): string { return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
