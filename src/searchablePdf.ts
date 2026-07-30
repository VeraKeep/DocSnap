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

import { jsPDF } from "jspdf";
import type { OCRWord } from "./ocr";

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
}

export interface PDFGenerationOptions {
  /** Title embedded in PDF metadata */
  title?: string;
}

// ── PDF Generation ─────────────────────────────────────────────────

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
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (options.title) {
    pdf.setProperties({ title: options.title });
  }

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

    // 1. Add the document image as full-page background
    pdf.addImage(page.imageUrl, "JPEG", x, y, drawWidth, drawHeight);

    // 2. Add invisible text layer from OCR words
    if (page.words && page.words.length > 0) {
      const scaleX = drawWidth / page.imgNaturalWidth;
      const scaleY = drawHeight / page.imgNaturalHeight;

      for (const word of page.words) {
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
  pages: { imageUrl: string; imgNaturalWidth: number; imgNaturalHeight: number }[],
  options: PDFGenerationOptions = {},
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (options.title) {
    pdf.setProperties({ title: options.title });
  }

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

    pdf.addImage(page.imageUrl, "JPEG", x, y, drawWidth, drawHeight);
  }

  return pdf.output("blob");
}
