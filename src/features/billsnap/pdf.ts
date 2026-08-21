/**
 * pdf.ts
 * Client-side PDF rasterization using pdfjs-dist.
 *
 * Bills often arrive as PDFs, so BillSnap rasterizes the FIRST page of an
 * uploaded PDF to a PNG image and feeds it through the exact same OpenAI vision
 * extraction used for photo uploads — the server still receives an image.
 *
 * The PDF engine is heavy, so it is lazy-loaded on first use and the import
 * promise is shared with concurrent callers — exactly the pattern src/ocr.ts
 * uses for tesseract.js. The worker is emitted as a Vite asset URL and wired up
 * once, so rendering never falls back to a (connection-blocked) CDN default.
 * Any error here (corrupt/encrypted/unreadable PDF, canvas unsupported, etc.)
 * throws and the caller degrades gracefully to the empty manual form.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

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

/** Scale for rasterization (~2x) — sharp enough for the vision extractor. */
const RENDER_SCALE = 2;

/**
 * Renders the first page of an uploaded PDF to a PNG and returns the PNG's
 * base64 payload (sans the `data:...;base64,` prefix), ready for
 * extractBillFromImage. Throws on any failure so callers fall back cleanly.
 */
export async function pdfFirstPageToPng(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc: PDFDocumentProxy = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering isn't supported in this browser.");
    }
    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      throw new Error("The PDF page could not be rendered as an image.");
    }
    return base64;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
