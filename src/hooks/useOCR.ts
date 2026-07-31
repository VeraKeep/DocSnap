import { useCallback, useRef, useState } from "react";
import { recognizePages } from "../ocr";
import {
  generateSearchablePDF,
  generatePlainPDF,
  type PDFPageEntry,
} from "../searchablePdf";
import { applyFilter, getSourceForFilter } from "../imageFilters";
import type { PageEntry } from "./usePages";

export type OCRPhase = "preparing" | "rendering" | "recognizing" | "assembling" | null;

export interface OCRProgressInfo {
  page: number;
  totalPages: number;
  status: string;
  /** 0–1 progress for the current page's recognition */
  pageProgress: number;
  /** The current phase of the OCR pipeline */
  phase: OCRPhase;
  /** Approx estimated seconds remaining (null if still calibrating) */
  etaSeconds: number | null;
}

export function useOCR() {
  const [ocrProgress, setOcrProgress] = useState<OCRProgressInfo | null>(null);
  const [ocrPhase, setOcrPhase] = useState<OCRPhase>(null);
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
      setOcrPhase("rendering");

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

        setOcrPhase("assembling");
        // Brief pause so the UI can show "Assembling PDF…"
        await new Promise((r) => setTimeout(r, 150));

        return await generatePlainPDF(pageEntries, {
          title: "DocSnap Document",
        });
      } finally {
        setIsOCRActive(false);
        setOcrPhase(null);
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
      setOcrPhase("preparing");
      setOcrProgress(null);

      try {
        // Step 1: Pre-render all pages with their selected filters
        setOcrPhase("rendering");
        const renderedPages: {
          imageUrl: string;
          imgNaturalWidth: number;
          imgNaturalHeight: number;
        }[] = [];

        for (let i = 0; i < allPages.length; i++) {
          if (controller.signal.aborted) return null;
          setOcrProgress({
            page: i + 1,
            totalPages: allPages.length,
            status: "rendering",
            pageProgress: (i + 1) / allPages.length,
            phase: "rendering",
            etaSeconds: null,
          });
          const page = allPages[i];
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

        // Track per-page timings for ETA estimation
        const perPageTimes: number[] = [];
        let pageStartTime = 0;

        // Step 2: Run OCR on all pages
        setOcrPhase("recognizing");
        const imageUrls = renderedPages.map((p) => p.imageUrl);
        const ocrResults = await recognizePages(
          imageUrls,
          (info) => {
            const now = Date.now();
            if (info.status === "recognizing") {
              pageStartTime = now;
            } else {
              const elapsed = now - pageStartTime;
              if (elapsed > 0 && elapsed < 300_000) { // Ignore outliers
                perPageTimes.push(elapsed);
              }
            }
            // Calculate ETA from average per-page time
            const remaining = allPages.length - info.page;
            let etaSeconds: number | null = null;
            if (perPageTimes.length > 0 && remaining > 0) {
              const avgMs = perPageTimes.reduce((a, b) => a + b, 0) / perPageTimes.length;
              etaSeconds = Math.round((avgMs * remaining) / 1000);
            }

            setOcrProgress({
              page: info.page,
              totalPages: info.totalPages,
              status: info.status,
              pageProgress: info.progress,
              phase: "recognizing",
              etaSeconds,
            });
          },
          controller.signal,
        );

        if (controller.signal.aborted) return null;

        // Step 3: Generate searchable PDF
        setOcrPhase("assembling");
        setOcrProgress({
          page: allPages.length,
          totalPages: allPages.length,
          status: "assembling",
          pageProgress: 1,
          phase: "assembling",
          etaSeconds: 0,
        });

        // Brief pause so the UI can show "Assembling PDF…"
        await new Promise((r) => setTimeout(r, 150));

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
        setOcrPhase(null);
        ocrAbortRef.current = null;
      }
    },
    [],
  );

  return {
    runOCR,
    skipOCR,
    ocrProgress,
    ocrPhase,
    ocrAbortRef,
    cancelOCR,
    isOCRActive,
  };
}
