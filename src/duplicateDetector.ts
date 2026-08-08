/** Lightweight duplicate detection shared by local/cloud save flows. */
export interface DuplicateDocument { id: string; name: string; date: string; contentHash?: string; ocrText?: string }
export interface DuplicateMatch {
  isDuplicate: true;
  matchedDoc: Pick<DuplicateDocument, "name" | "date" | "id">;
  method: "exact" | "similar";
  similarity?: number;
}
export interface DuplicateOptions { isPro?: boolean; exactHash?: string; ocrText?: string }

/** Fast non-cryptographic hash. Sampling keeps large camera images cheap. */
export function hashImageData(data: string): string {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let i = 0; i < data.length; i += step) { hash ^= data.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0") + ":" + data.length;
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((w) => w.length > 1));
}
export function textSimilarity(a: string, b: string): number {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0; for (const word of left) if (right.has(word)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

/** Tier 1 exact matching for everyone; Tier 2 OCR similarity for Pro. */
export function findDuplicate(existing: DuplicateDocument[], options: DuplicateOptions): DuplicateMatch | null {
  if (options.exactHash) {
    const exact = existing.find((doc) => doc.contentHash === options.exactHash);
    if (exact) return { isDuplicate: true, matchedDoc: pick(exact), method: "exact" };
  }
  if (options.isPro && options.ocrText?.trim()) {
    let best: { doc: DuplicateDocument; score: number } | null = null;
    for (const doc of existing) { const score = textSimilarity(options.ocrText, doc.ocrText || ""); if (score > 0.85 && (!best || score > best.score)) best = { doc, score }; }
    if (best) return { isDuplicate: true, matchedDoc: pick(best.doc), method: "similar", similarity: best.score };
  }
  return null;
}
function pick(doc: DuplicateDocument) { return { id: doc.id, name: doc.name, date: doc.date }; }
