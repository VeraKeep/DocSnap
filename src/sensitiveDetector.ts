import type { OCRWord } from "./ocr";

export type SensitiveType = "ssn" | "credit_card" | "phone" | "email" | "account";
export interface SensitiveItem { type: SensitiveType; value: string; position: { x: number; y: number; width: number; height: number } }

/** Finds sensitive values and maps them to OCR word bounds. Suggestions only; never mutates input. */
export function detectSensitiveInfo(words: OCRWord[]): SensitiveItem[] {
  const patterns: [SensitiveType, RegExp][] = [
    ["ssn", /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g],
    ["credit_card", /\b(?:\d[ -]?){13,19}\b/g],
    ["phone", /(?:\(\d{3}\)\s*|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g],
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["account", /\b(?:account\s*#?|acct\.?|routing|aba)\s*[:#-]?\s*\d{4,}\b/gi],
  ];
  const out: SensitiveItem[] = [];
  for (const word of words) {
    for (const [type, re] of patterns) {
      re.lastIndex = 0;
      const match = re.exec(word.text);
      if (!match) continue;
      const fraction = match.index / Math.max(1, word.text.length);
      const widthFraction = match[0].length / Math.max(1, word.text.length);
      out.push({ type, value: match[0], position: { x: word.bbox.x0 + (word.bbox.x1-word.bbox.x0)*fraction, y: word.bbox.y0, width: (word.bbox.x1-word.bbox.x0)*widthFraction, height: word.bbox.y1-word.bbox.y0 } });
    }
  }
  return out;
}
