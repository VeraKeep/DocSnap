import { useCallback, useRef, useState } from "react";
import { ocrEnabled, recognizePages } from "../ocr";
import {
  generateSearchablePDF,
  generatePlainPDF,
  type PDFPageEntry,
} from "../searchablePdf";
import { applyFilter, getSourceForFilter } from "../imageFilters";
import type { PageEntry } from "./usePages";

export function useOCR() {
  const [ocrProgress, setOcrProgress] = useState<{
    page: number;
    totalPages: number;
    status: string;
  } | null>(null);
  const [isOCRActive, setIsOCRActive] = useState(false);
  const ocrAbortRef = useRef<AbortController | null>(null);

  const cancelOCR = useCallback(() => {
    ocrAbortRef.current?.abort();
  }, []);

  /** Generate a plain (non-searchable) PDF from page entries. Returns the blob. */
  const skipOCR = useCallback(
    async (allPages: PageEntry[]): Promise<Blob | null> => {
      if (!allPages || allPages.length === 0) return null;

      ocrAbortRef.current?.abort();
      setIsOCRActive(true);

      try {
        const pageEntries: {
          imageUrl: string;
          imgNaturalWidth: number;
          imgNaturalHeight: number;
        }[] = [];

        for (const page of allPages) {
          const sourceUrl = getSourceForFilter(page.original, page.processed, page.filter);
          const imageToUse = await applyFilter(sourceUrl, page.filter);

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = imageToUse;
          });

          pageEntries.push({
            imageUrl: imageToUse,
            imgNaturalWidth: img.naturalWidth,
            imgNaturalHeight: img.naturalHeight,
          });
        }

        return await generatePlainPDF(pageEntries, {
          title: "DocSnap Document",
        });
      } finally {
        setIsOCRActive(false);
        ocrAbortRef.current = null;
      }
    },
    [],
  );

  /** Run full OCR pipeline: render pages → recognize text → generate searchable PDF. Returns the blob. */
  const runOCR = useCallback(
    async (allPages: PageEntry[]): Promise<Blob | null> => {
      if (!allPages || allPages.length === 0) return null;

      const controller = new AbortController();
      ocrAbortRef.current = controller;
      setIsOCRActive(true);
      setOcrProgress(null);

      try {
        // Step 1: Pre-render all pages with their selected filters
        const renderedPages: {
          imageUrl: string;
          imgNaturalWidth: number;
          imgNaturalHeight: number;
        }[] = [];

        for (const page of allPages) {
          if (controller.signal.aborted) return null;
          const sourceUrl = getSourceForFilter(page.original, page.processed, page.filter);
          const imageToUse = await applyFilter(sourceUrl, page.filter);

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = imageToUse;
          });

          renderedPages.push({
            imageUrl: imageToUse,
            imgNaturalWidth: img.naturalWidth,
            imgNaturalHeight: img.naturalHeight,
          });
        }

        if (controller.signal.aborted) return null;

        // Step 2: Run OCR on all pages
        const imageUrls = renderedPages.map((p) => p.imageUrl);
        const ocrResults = await recognizePages(
          imageUrls,
          (info) => {
            setOcrProgress({
              page: info.page,
              totalPages: info.totalPages,
              status: info.status,
            });
          },
          controller.signal,
        );

        if (controller.signal.aborted) return null;

        // Step 3: Generate searchable PDF
        const pdfPages: PDFPageEntry[] = renderedPages.map((rp, i) => ({
          imageUrl: rp.imageUrl,
          words: ocrResults[i],
          imgNaturalWidth: rp.imgNaturalWidth,
          imgNaturalHeight: rp.imgNaturalHeight,
        }));

        return await generateSearchablePDF(pdfPages, {
          title: "DocSnap Document",
        });
      } finally {
        setIsOCRActive(false);
        ocrAbortRef.current = null;
      }
    },
    [],
  );

  return {
    runOCR,
    skipOCR,
    ocrProgress,
    ocrAbortRef,
    cancelOCR,
    isOCRActive,
  };
}
