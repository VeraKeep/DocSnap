/**
 * pdfExtract.ts
 * Client-side per-page PDF text extraction for BookSnap.
 *
 * Stage 1 stored a single flat blob (meetingsnap/textExtract.ts) with no page
 * boundaries. Stage 2 needs immutable page anchors — every passage must trace
 * back to a concrete edition + page (+ paragraph). This extractor adapts the
 * BillSnap pdfjs-dist pattern (billsnap/pdf.ts) and pulls text *per page* via
 * `page.getTextContent()` (which works across all pages, not just the first),
 * then groups the ordered text lines into paragraphs so the reader can anchor
 * highlights/notes to a stable paragraph index.
 *
 * The PDF engine is heavy, so it is lazy-loaded on first use and the import
 * promise is shared with concurrent callers — exactly the pattern src/ocr.ts
 * uses for tesseract.js and billsnap/pdf.ts uses for pdfjs. The worker is
 * emitted as a Vite asset URL and wired once, so rendering never falls back to
 * a (connection-blocked) CDN default.
 *
 * This is page-agnostic and date-stamped-neutral: it works uniformly for any
 * page count and any publish date — the output is a stable ordered list of
 * { pageNumber, text } records with paragraph boundaries preserved.
 *
 * OCR fallback: for scanned/image-only PDFs where pdfjs yields no readable
 * text, each page is rasterized (Billsnap-style) and passed through the shared
 * OCR engine (src/ocr.ts). OCR is best-effort — if it's unavailable or fails,
 * the page still appears in the list (possibly empty) and the UI degrades
 * honestly rather than fabricating text.
 *
 * DRM/copyright: this only ever reads the user's own uploaded, licensed copy
 * in the browser. No extracted text is redistributed.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OCRWord } from "~/ocr";

/** One extracted page. `text` preserves paragraph boundaries (\n\n separators). */
export interface ExtractedBookPage {
  pageNumber: number;
  text: string;
}

type PDFJSModule = typeof import("pdfjs-dist");
let pdfjsModulePromise: Promise<PDFJSModule> | null = null;

/** Lazy, singleton loader for pdfjs-dist (code-split like src/ocr.ts). */
async function loadPdfjs(): Promise<PDFJSModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const { default: workerSrc } = await import(
        "pdfjs-dist/build/pdf.worker.min.mjs?url"
      );
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })();
  }
  return pdfjsModulePromise;
}

/** Scale for OCR rasterization (~2x). */
const OCR_RENDER_SCALE = 2;

/** A page is "meaningful" only if it has a usable amount of real text. */
function meaningful(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  const printable = (t.match(/[\x20-\x7E\n\r\t]/g) ?? []).length;
  return t.length ? printable / t.length >= 0.6 : false;
}

/* ------------------------------------------------------------------ */
/* Text-layer extraction (pdfjs getTextContent) per page               */
/* ------------------------------------------------------------------ */

interface LineLike {
  text: string;
  y: number;
  height: number;
}

/**
 * Pull one page's text content, group the ordered pdfjs text items into lines
 * (using hasEOL), then group lines into paragraphs using vertical-gap
 * heuristics. Returns the page text with paragraphs separated by blank lines.
 */
function pageTextFromContent(
  textContent: { items: unknown[] },
): string {
  // 1. Group sequential text items into physical lines.
  const lines: LineLike[] = [];
  let cur = "";
  let curY = 0;
  let curH = 0;
  for (const raw of textContent.items) {
    const item = raw as {
      str?: unknown;
      transform?: number[];
      height?: number;
      hasEOL?: boolean;
    };
    if (typeof item.str !== "string") continue;
    const s = item.str;
    const y = item.transform?.[5] ?? 0;
    const h = typeof item.height === "number" ? item.height : 0;
    cur += s;
    if (curY === 0) curY = y;
    curH = Math.max(curH, h);
    if (item.hasEOL) {
      lines.push({ text: cur, y: curY, height: curH || 10 });
      cur = "";
      curY = 0;
      curH = 0;
    }
  }
  if (cur.trim()) lines.push({ text: cur, y: curY, height: curH || 10 });

  // 2. Group lines into paragraphs by vertical gap (a much larger gap than the
  //    line height signals a paragraph break).
  const paragraphs: string[] = [];
  let paraLines: LineLike[] = [];
  for (const ln of lines) {
    const prev = paraLines[paraLines.length - 1];
    if (prev && Math.abs(ln.y - prev.y) > prev.height * 1.5 + 4) {
      paragraphs.push(joinLines(paraLines));
      paraLines = [];
    }
    paraLines.push(ln);
  }
  if (paraLines.length) paragraphs.push(joinLines(paraLines));

  const out = paragraphs
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/ +([.,;:!?'")])/g, "$1").trim())
    .filter(Boolean)
    .join("\n\n");
  return out;
}

function joinLines(lines: LineLike[]): string {
  return lines
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Text-layer extraction across the whole document                     */
/* ------------------------------------------------------------------ */

async function extractTextLayer(doc: PDFDocumentProxy): Promise<ExtractedBookPage[]> {
  const pages: ExtractedBookPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    pages.push({ pageNumber: i, text: pageTextFromContent(textContent) });
  }
  return pages;
}

/* ------------------------------------------------------------------ */
/* OCR fallback (scanned/image-only books)                             */
/* ------------------------------------------------------------------ */

/** Rasterize a page to a PNG data URL (Billsnap-style). */
async function pageToPngDataUrl(page: { render: (p: any) => { promise: Promise<void> }; getViewport: (p: { scale: number }) => { width: number; height: number } }): Promise<string> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering isn't supported in this browser.");
  }
  await page.render({ canvasContext: context, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl) throw new Error("The PDF page could not be rendered as an image.");
  return dataUrl;
}

/** Collapse OCR words into a text block with paragraph boundaries preserved. */
function wordsToParagraphs(words: { text: string; bbox: { y0: number } }[]): string {
  // Group words into lines by vertical proximity, then into paragraphs by gap.
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines: { text: string; y: number }[] = [];
  let cur: { text: string; y: number }[] = [];
  let curY = 0;
  for (const w of sorted) {
    if (cur.length && Math.abs(w.bbox.y0 - curY) > 18) {
      lines.push({ text: cur.map((c) => c.text).join(" "), y: curY });
      cur = [];
    }
    if (!cur.length) curY = w.bbox.y0;
    cur.push({ text: w.text, y: w.bbox.y0 });
  }
  if (cur.length) lines.push({ text: cur.map((c) => c.text).join(" "), y: curY });

  const paragraphs: string[] = [];
  let para: { text: string; y: number }[] = [];
  for (const ln of lines) {
    const prev = para[para.length - 1];
    if (prev && Math.abs(ln.y - prev.y) > 30) {
      paragraphs.push(para.map((p) => p.text).join(" "));
      para = [];
    }
    para.push(ln);
  }
  if (para.length) paragraphs.push(para.map((p) => p.text).join(" "));
  return paragraphs
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Best-effort OCR fallback. Returns null if OCR isn't available. */
async function ocrFallback(doc: PDFDocumentProxy): Promise<ExtractedBookPage[] | null> {
  const ocrMod = (await import("~/ocr").catch(() => null)) as
    | { recognizePage?: (imageUrl: string) => Promise<OCRWord[]> }
    | null;
  const recognizePage = ocrMod?.recognizePage;
  if (!recognizePage) return null;
  const pages: ExtractedBookPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    try {
      const dataUrl = await pageToPngDataUrl(page);
      const words = await recognizePage(dataUrl);
      pages.push({ pageNumber: i, text: wordsToParagraphs(words) });
    } catch (err) {
      console.error(`OCR failed for page ${i}:`, err);
      pages.push({ pageNumber: i, text: "" });
    }
  }
  return pages;
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract a book's PDF into a stable, ordered per-page list, preserving
 * paragraph boundaries (paragraphs separated by blank lines). Uses the pdfjs
 * text layer for text PDFs; falls back to per-page OCR for scanned books.
 */
export async function extractBookPages(file: File): Promise<ExtractedBookPage[]> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc: PDFDocumentProxy = await pdfjs.getDocument({ data }).promise;
  try {
    const textPages = await extractTextLayer(doc);
    const totalChars = textPages.reduce((n, p) => n + p.text.length, 0);
    const hasReadableText = textPages.some((p) => meaningful(p.text)) && totalChars > 0;
    if (hasReadableText) return textPages;
    // Otherwise treat the book as scanned images and try OCR.
    return (await ocrFallback(doc)) ?? textPages;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
