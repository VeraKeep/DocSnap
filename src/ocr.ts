/**
 * ocr.ts
 * Client-side OCR engine using Tesseract.js.
 * All processing is in-browser — no server, no uploads.
 *
 * Future monetization seam: the `ocrEnabled` flag below can be gated
 * behind a feature flag / paywall check without changing any call sites.
 */

import type { Worker, RecognizeResult, Page } from "tesseract.js";

// Keep the OCR engine out of the initial application bundle. Tesseract is only
// needed after the user enables OCR for a scan, so load it on first use and
// share that import promise with concurrent calls.
type TesseractModule = typeof import("tesseract.js");
let tesseractModulePromise: Promise<TesseractModule> | null = null;

async function loadTesseract(): Promise<TesseractModule> {
  if (!tesseractModulePromise) {
    tesseractModulePromise = import("tesseract.js");
  }
  return tesseractModulePromise;
}

// ── Monetization seam ──────────────────────────────────────────────
// Set to false to disable OCR (e.g., behind a paywall).
// All call sites check this before starting recognition.
export let ocrEnabled = true;

// ── Types ──────────────────────────────────────────────────────────

export interface OCRWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export type OCRProgressCallback = (info: {
  page: number;
  totalPages: number;
  status: string;
  progress: number; // 0-1
}) => void;

// ── Worker management ──────────────────────────────────────────────

let worker: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

/**
 * Initialize the Tesseract worker (lazy, singleton).
 * The worker is reused across multiple pages for efficiency.
 */
export async function initWorker(
  logger?: (msg: { status: string; progress: number }) => void,
): Promise<Worker> {
  if (worker) return worker;
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async () => {
    const Tesseract = await loadTesseract();
    const w = await Tesseract.createWorker("eng", 1, {
      logger: logger || (() => {}),
    });
    worker = w;
    workerInitPromise = null;
    return w;
  })();

  return workerInitPromise;
}

/**
 * Terminate the Tesseract worker and free memory.
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      // Worker may already be terminated
    }
    worker = null;
    workerInitPromise = null;
  }
}

// ── Recognition ────────────────────────────────────────────────────

/**
 * Extract all words from a Tesseract Page result.
 */
function extractWords(page: Page): OCRWord[] {
  const words: OCRWord[] = [];

  if (!page.blocks) return words;

  for (const block of page.blocks) {
    if (!block.paragraphs) continue;
    for (const para of block.paragraphs) {
      if (!para.lines) continue;
      for (const line of para.lines) {
        if (!line.words) continue;
        for (const word of line.words) {
          // Skip very low confidence words to avoid gibberish in the text layer
          if (word.confidence < 30) continue;
          words.push({
            text: word.text,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
            confidence: word.confidence,
          });
        }
      }
    }
  }

  return words;
}

/**
 * Recognize text in a single page image.
 * Returns an array of words with bounding boxes and confidence scores.
 */
export async function recognizePage(imageUrl: string): Promise<OCRWord[]> {
  const w = await initWorker();
  const result: RecognizeResult = await w.recognize(imageUrl);
  return extractWords(result.data);
}

/**
 * Recognize multiple pages sequentially, reporting progress.
 * Each page is processed independently — if one fails, the rest continue.
 *
 * @param imageUrls - Array of image data URLs to OCR
 * @param onProgress - Called after each page completes
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of OCR word arrays (null for pages that failed)
 */
export async function recognizePages(
  imageUrls: string[],
  onProgress: OCRProgressCallback,
  signal?: AbortSignal,
): Promise<(OCRWord[] | null)[]> {
  const results: (OCRWord[] | null)[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    if (signal?.aborted) {
      // Fill remaining with null
      while (results.length < imageUrls.length) results.push(null);
      return results;
    }

    onProgress({
      page: i + 1,
      totalPages: imageUrls.length,
      status: "recognizing",
      progress: i / imageUrls.length,
    });

    try {
      const words = await recognizePage(imageUrls[i]);
      results.push(words);
    } catch (err) {
      console.error(`OCR failed for page ${i + 1}:`, err);
      results.push(null); // graceful degradation — page still in PDF
    }

    onProgress({
      page: i + 1,
      totalPages: imageUrls.length,
      status: results[i] ? "done" : "failed",
      progress: (i + 1) / imageUrls.length,
    });
  }

  return results;
}
