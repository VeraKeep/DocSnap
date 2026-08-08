/**
 * searchablePdf.ts
 * Generates searchable PDFs with invisible text layers using jsPDF.
 *
 * Each page contains:
 * 1. The document image as full background
 * 2. An invisible text layer with recognized words positioned over the image
 *
 * The text uses rendering mode 3 ("invisible") so it's searchable/selectable
 * but doesn't visually overlay the document.
 */

import type { OCRWord } from "./ocr";
import type { Redaction } from "./components/RedactionTool";

// PDF generation is only needed after a scan; defer the sizeable jsPDF engine
// until the user downloads a document.
let jsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;
async function loadJsPDF(): Promise<typeof import("jspdf")> {
  if (!jsPdfModulePromise) jsPdfModulePromise = import("jspdf");
  return jsPdfModulePromise;
}

// ── Types ──────────────────────────────────────────────────────────

export interface PDFPageEntry {
  /** The final rendered image (after filter applied) as data URL */
  imageUrl: string;
  /** OCR results for this page (null = no OCR, failed, or skipped) */
  words: OCRWord[] | null;
  /** Natural width of the image in pixels */
  imgNaturalWidth: number;
  /** Natural height of the image in pixels */
  imgNaturalHeight: number;
  /** Permanent black redactions in image pixel coordinates. */
  redactions?: Redaction[];
}

export interface PDFGenerationOptions {
  /** Title embedded in PDF metadata */
  title?: string;
  /** Optional password required to open the PDF (jsPDF RC4 encryption). */
  password?: string;
}

// ── PDF Generation ─────────────────────────────────────────────────
async function burnRedactions(imageUrl: string, redactions: Redaction[], width: number, height: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Failed to load image")); img.src = imageUrl; });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) return imageUrl; ctx.drawImage(img, 0, 0, width, height); ctx.fillStyle = "#000";
  for (const r of redactions) ctx.fillRect(Math.max(0,r.x), Math.max(0,r.y), Math.max(0,r.width), Math.max(0,r.height));
  return canvas.toDataURL("image/jpeg", 0.95);
}

/**
 * Generate a searchable PDF from an array of page entries.
 *
 * Each page gets the image as background and invisible selectable text
 * positioned according to OCR word bounding boxes.
 */
export async function generateSearchablePDF(
  pages: PDFPageEntry[],
  options: PDFGenerationOptions = {},
): Promise<Blob> {
  const { jsPDF } = await loadJsPDF();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    ...(options.password
      ? {
          encryption: {
            userPassword: options.password,
            ownerPassword: options.password,
            userPermissions: ["print", "copy", "modify"],
          },
        }
      : {}),
  });

  pdf.setProperties({
    ...(options.title ? { title: options.title } : {}),
    author: "DocSnap © 2026 — VeraKeep™",
    creator: "DocSnap by VeraKeep™",
    subject: "Document scanned with DocSnap © 2026",
  });

  const pageWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      pdf.addPage();
    }

    // Calculate image placement to fit within margins while preserving aspect ratio
    const ratio = Math.min(
      maxWidth / page.imgNaturalWidth,
      maxHeight / page.imgNaturalHeight,
    );
    const drawWidth = page.imgNaturalWidth * ratio;
    const drawHeight = page.imgNaturalHeight * ratio;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    // 1. Burn redactions into a raster canvas before embedding the image.
    const imageUrl = page.redactions?.length ? await burnRedactions(page.imageUrl, page.redactions, page.imgNaturalWidth, page.imgNaturalHeight) : page.imageUrl;
    pdf.addImage(imageUrl, "JPEG", x, y, drawWidth, drawHeight);

    // Brand every generated page without obscuring the scanned document.
    pdf.setFontSize(7);
    pdf.setTextColor(110, 110, 110);
    pdf.text("© 2026 DocSnap · VeraKeep™", pageWidth / 2, pageHeight - 3, { align: "center" });

    // 2. Add invisible text layer from OCR words
    if (page.words && page.words.length > 0) {
      const scaleX = drawWidth / page.imgNaturalWidth;
      const scaleY = drawHeight / page.imgNaturalHeight;

      for (const word of page.words) {
        const overlaps = page.redactions?.some((r) => word.bbox.x0 < r.x + r.width && word.bbox.x1 > r.x && word.bbox.y0 < r.y + r.height && word.bbox.y1 > r.y);
        if (overlaps) continue;
        const wordW = Math.max(0.01, (word.bbox.x1 - word.bbox.x0) * scaleX);
        const wordH = Math.max(0.01, (word.bbox.y1 - word.bbox.y0) * scaleY);
        const wordX = x + word.bbox.x0 * scaleX;
        // y0 is top in image coords; PDF y is from bottom
        // We position text baseline near the bottom of the word bbox
        const wordY = y + word.bbox.y1 * scaleY;

        // Skip words that are too small to be meaningful
        if (wordH < 0.5 || wordW < 0.5) continue;

        // Set font size proportional to word height
        // Use a slightly smaller size than the full bbox to avoid overlaps
        const fontSize = Math.min(wordH * 0.85, 12);
        if (fontSize < 0.1) continue;

        pdf.setFontSize(fontSize);

        // Use renderingMode "invisible" (mode 3) — text is selectable
        // and searchable but not visually rendered
        pdf.text(word.text, wordX, wordY, {
          renderingMode: "invisible",
          baseline: "bottom",
        });
      }
    }
  }

  return pdf.output("blob");
}

/**
 * Simple non-OCR PDF generation (fallback / "Skip OCR" path).
 * Generates a plain image-only PDF with no text layer.
 */
export async function generatePlainPDF(
  pages: { imageUrl: string; imgNaturalWidth: number; imgNaturalHeight: number; redactions?: Redaction[] }[],
  options: PDFGenerationOptions = {},
): Promise<Blob> {
  const { jsPDF } = await loadJsPDF();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    ...(options.password
      ? {
          encryption: {
            userPassword: options.password,
            ownerPassword: options.password,
            userPermissions: ["print", "copy", "modify"],
          },
        }
      : {}),
  });

  pdf.setProperties({
    ...(options.title ? { title: options.title } : {}),
    author: "DocSnap © 2026 — VeraKeep™",
    creator: "DocSnap by VeraKeep™",
    subject: "Document scanned with DocSnap © 2026",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      pdf.addPage();
    }

    const ratio = Math.min(
      maxWidth / page.imgNaturalWidth,
      maxHeight / page.imgNaturalHeight,
    );
    const drawWidth = page.imgNaturalWidth * ratio;
    const drawHeight = page.imgNaturalHeight * ratio;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    const imageUrl = page.redactions?.length ? await burnRedactions(page.imageUrl, page.redactions, page.imgNaturalWidth, page.imgNaturalHeight) : page.imageUrl;
    pdf.addImage(imageUrl, "JPEG", x, y, drawWidth, drawHeight);

    pdf.setFontSize(7);
    pdf.setTextColor(110, 110, 110);
    pdf.text("© 2026 DocSnap · VeraKeep™", pageWidth / 2, pageHeight - 3, { align: "center" });
  }

  return pdf.output("blob");
}
