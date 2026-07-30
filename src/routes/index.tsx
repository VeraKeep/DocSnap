import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { perspectiveWarp, processDocument, type Quad } from "../documentProcessor";
import {
  applyFilter,
  getSourceForFilter,
  ALL_FILTERS,
  FILTER_LABELS,
  type FilterType,
} from "../imageFilters";
import { ocrEnabled, recognizePages, terminateWorker, type OCRWord } from "../ocr";
import {
  generateSearchablePDF,
  generatePlainPDF,
  type PDFPageEntry,
} from "../searchablePdf";

type AppState = "idle" | "starting" | "active" | "processing" | "adjusting" | "preview" | "ocr" | "error";
type CornerName = keyof Quad;

function createDefaultCorners(width: number, height: number): Quad {
  const insetX = width * 0.08;
  const insetY = height * 0.08;

  return {
    tl: { x: insetX, y: insetY },
    tr: { x: width - insetX, y: insetY },
    br: { x: width - insetX, y: height - insetY },
    bl: { x: insetX, y: height - insetY },
  };
}

interface PageEntry {
  processed: string | null;
  original: string;
  filter: FilterType;
}

// Drag-and-drop state tracked in a ref so pointer handlers never read stale closures.
interface DragState {
  index: number;
  startX: number;
  deltaX: number;
  overIndex: number;
}

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const capturedImageDataRef = useRef<ImageData | null>(null);
  const activeCornerRef = useRef<CornerName | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<AppState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [currentFilter, setCurrentFilter] = useState<FilterType>("auto");
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [isComputingFilter, setIsComputingFilter] = useState(false);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [cropCorners, setCropCorners] = useState<Quad | null>(null);

  // OCR state
  const [ocrProgress, setOcrProgress] = useState<{
    page: number;
    totalPages: number;
    status: string;
  } | null>(null);
  const [ocrPagesForProcessing, setOcrPagesForProcessing] = useState<PageEntry[] | null>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);

  // Drag-and-drop state (ref for stable pointer handlers, counter to trigger re-renders)
  const dragRef = useRef<DragState | null>(null);
  const [, setDragTick] = useState(0);
  const rerenderDrag = useCallback(() => setDragTick((t) => t + 1), []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const attachVideo = (video: HTMLVideoElement | null) => {
  videoRef.current = video;

  if (!video || !streamRef.current) return;

  video.srcObject = streamRef.current;
  video.muted = true;
  video.playsInline = true;

  void video.play().catch((error) => {
    console.error("Camera preview failed to start:", error);
  });
};

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    stopCamera();
    setErrorMessage("");
    setCapturedImage(null);
    setProcessedImage(null);
    setCurrentFilter("auto");
    setDisplayImage(null);
    setCropCorners(null);
    capturedImageDataRef.current = null;

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        "Your browser doesn't support camera access. Please use a modern browser like Chrome, Safari, or Firefox.",
      );
      setState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setState("active");

    } catch (err: unknown) {
      const e = err as DOMException;
      const msg =
        e.name === "NotAllowedError"
          ? "Camera access was denied. Please allow camera access in your browser settings and try again."
          : e.name === "NotFoundError"
            ? "No camera found. Please connect a camera and try again."
            : `Could not access camera: ${e.message}`;
      setErrorMessage(msg);
      setState("error");
    }
  }, [stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    capturedImageDataRef.current = imageData;

    const originalDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(originalDataUrl);

    stopCamera();
    setState("processing");

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const result = processDocument(imageData, "image/jpeg", 0.92);

          if (result) {
            setProcessedImage(result.dataUrl);
            setState("preview");
          } else {
            setCropCorners(createDefaultCorners(canvas.width, canvas.height));
            setState("adjusting");
          }
        } catch (error) {
          console.error("Auto-crop failed:", error);
          setCropCorners(createDefaultCorners(canvas.width, canvas.height));
          setState("adjusting");
        }
      }, 100);
    });
  }, [stopCamera]);

  const applyManualCrop = useCallback(() => {
    const imageData = capturedImageDataRef.current;
    if (!imageData || !cropCorners) return;

    try {
      const cropped = perspectiveWarp(
        imageData,
        imageData.width,
        imageData.height,
        cropCorners,
        "image/jpeg",
        0.92,
      );
      setProcessedImage(cropped);
      setCurrentFilter("auto");
      setDisplayImage(null);
      setState("preview");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to crop image";
      setErrorMessage(message);
      setState("error");
    }
  }, [cropCorners]);

  const updateCornerFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    const activeCorner = activeCornerRef.current;
    if (!canvas || !activeCorner) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    setCropCorners((current) =>
      current
        ? {
            ...current,
            [activeCorner]: {
              x: Math.max(0, Math.min(canvas.width - 1, x)),
              y: Math.max(0, Math.min(canvas.height - 1, y)),
            },
          }
        : current,
    );
  }, []);

  const beginCornerDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropCorners) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    const names: CornerName[] = ["tl", "tr", "br", "bl"];
    activeCornerRef.current = names.reduce((nearest, name) => {
      const a = cropCorners[nearest];
      const b = cropCorners[name];
      const distanceA = Math.hypot(a.x - x, a.y - y);
      const distanceB = Math.hypot(b.x - x, b.y - y);
      return distanceB < distanceA ? name : nearest;
    }, names[0]);

    canvas.setPointerCapture(event.pointerId);
    updateCornerFromPointer(event);
  }, [cropCorners, updateCornerFromPointer]);

  const endCornerDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    activeCornerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const retake = useCallback(() => {
    setCapturedImage(null);
    setProcessedImage(null);
    setCurrentFilter("auto");
    setDisplayImage(null);
    setCropCorners(null);
    capturedImageDataRef.current = null;
    // Restart the camera
    startCamera();
  }, [startCamera]);

  const deletePage = useCallback((index: number) => {
    // Cancel any in-progress drag when a page is deleted
    if (dragRef.current) {
      dragRef.current = null;
    }
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const movePage = useCallback((fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  // --- Drag-and-drop pointer handlers ---
  const SLOT_WIDTH = 56; // 48px thumbnail + 8px gap

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        index,
        startX: e.clientX,
        deltaX: 0,
        overIndex: index,
      };
      rerenderDrag();
    },
    [rerenderDrag],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.deltaX = e.clientX - d.startX;
      const slotOffset = Math.round(d.deltaX / SLOT_WIDTH);
      // pages.length might have changed if a delete happened, clamp safely
      d.overIndex = Math.max(
        0,
        Math.min((pages.length || 1) - 1, d.index + slotOffset),
      );
      rerenderDrag();
    },
    [rerenderDrag, pages.length],
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const { index, overIndex } = d;
      dragRef.current = null;
      if (overIndex !== index && overIndex >= 0 && overIndex < pages.length) {
        movePage(index, overIndex);
      }
      rerenderDrag();
    },
    [movePage, rerenderDrag, pages.length],
  );

  const handleDragPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be released
      }
      dragRef.current = null;
      rerenderDrag();
    },
    [rerenderDrag],
  );

  /** Build the list of all pages (saved + current capture) */
  const buildAllPages = useCallback((): PageEntry[] => {
    if (!capturedImage) return [...pages];
    return [
      ...pages,
      {
        processed: processedImage,
        original: capturedImage,
        filter: currentFilter,
      },
    ];
  }, [pages, capturedImage, processedImage, currentFilter]);

  /** Reset the app to idle state (after download or error) */
  const resetApp = useCallback(() => {
    setPages([]);
    setCapturedImage(null);
    setProcessedImage(null);
    setCurrentFilter("auto");
    setDisplayImage(null);
    setCropCorners(null);
    setOcrProgress(null);
    setOcrPagesForProcessing(null);
    capturedImageDataRef.current = null;
    setState("idle");
  }, []);

  /** Start OCR flow: build all pages, enter OCR state */
  const startOCR = useCallback(() => {
    if (!capturedImage) return;

    const allPages = buildAllPages();
    setOcrPagesForProcessing(allPages);
    setOcrProgress(null);
    setState("ocr");
  }, [capturedImage, buildAllPages]);

  /** Skip OCR — generate plain image PDF immediately */
  const skipOCR = useCallback(async () => {
    const allPages = ocrPagesForProcessing;
    if (!allPages || allPages.length === 0) return;

    // Cancel any in-progress OCR
    ocrAbortRef.current?.abort();

    setIsGenerating(true);

    try {
      // Pre-render all pages with their selected filters
      const pageEntries: { imageUrl: string; imgNaturalWidth: number; imgNaturalHeight: number }[] = [];

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

      const blob = await generatePlainPDF(pageEntries, {
        title: "DocSnap Document",
      });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      resetApp();
    } catch {
      setErrorMessage("Failed to generate PDF. Please try again.");
      setState("error");
    } finally {
      setIsGenerating(false);
      ocrAbortRef.current = null;
    }
  }, [ocrPagesForProcessing, resetApp]);

  // ── OCR processing effect ──────────────────────────────────────────
  useEffect(() => {
    if (state !== "ocr" || !ocrPagesForProcessing) return;

    const controller = new AbortController();
    ocrAbortRef.current = controller;

    // If OCR is disabled, skip straight to plain PDF
    if (!ocrEnabled) {
      skipOCR();
      return;
    }

    let cancelled = false;

    (async () => {
      const allPages = ocrPagesForProcessing;

      // Step 1: Pre-render all pages with their selected filters
      const renderedPages: {
        imageUrl: string;
        imgNaturalWidth: number;
        imgNaturalHeight: number;
      }[] = [];

      for (const page of allPages) {
        if (controller.signal.aborted) return;
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

      if (controller.signal.aborted) return;

      // Step 2: Run OCR on all pages
      const imageUrls = renderedPages.map((p) => p.imageUrl);
      const ocrResults = await recognizePages(
        imageUrls,
        (info) => {
          if (!cancelled) {
            setOcrProgress({
              page: info.page,
              totalPages: info.totalPages,
              status: info.status,
            });
          }
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (cancelled) return;

      // Step 3: Generate searchable PDF
      const pdfPages: PDFPageEntry[] = renderedPages.map((rp, i) => ({
        imageUrl: rp.imageUrl,
        words: ocrResults[i],
        imgNaturalWidth: rp.imgNaturalWidth,
        imgNaturalHeight: rp.imgNaturalHeight,
      }));

      const blob = await generateSearchablePDF(pdfPages, {
        title: "DocSnap Document",
      });

      // Step 4: Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      resetApp();
    })().catch((err) => {
      if (!cancelled) {
        console.error("OCR flow failed:", err);
        setErrorMessage("OCR processing failed. Your document has been downloaded as a plain PDF.");
        // Fall back to plain PDF
        skipOCR();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state, ocrPagesForProcessing]);

  // --- File import from device ---

  /** Process a single File through the document pipeline. */
  async function processFile(file: File): Promise<PageEntry> {
    // Load file as image via object URL (memory-efficient)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = URL.createObjectURL(file);
    });

    // Draw to canvas to get ImageData for the processor
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create canvas context");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const originalDataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Release the object URL
    URL.revokeObjectURL(img.src);

    // Run through the same document processing pipeline
    try {
      const result = processDocument(imageData, "image/jpeg", 0.92);
      return {
        original: originalDataUrl,
        processed: result?.dataUrl ?? null,
        filter: "auto" as FilterType,
      };
    } catch {
      // If processing throws, use original
      return {
        original: originalDataUrl,
        processed: null,
        filter: "auto" as FilterType,
      };
    }
  }

  /** Handle file input selection — process each file through the pipeline. */
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      setImportProgress({ current: 0, total: fileArray.length });
      setState("processing");

      const newPages: PageEntry[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        setImportProgress({ current: i + 1, total: fileArray.length });

        // Yield to the browser so the UI can update the progress counter
        await new Promise((r) => setTimeout(r, 0));

        try {
          const entry = await processFile(fileArray[i]);
          newPages.push(entry);
        } catch (err) {
          console.error(
            "Failed to process file:",
            (fileArray[i] as File).name,
            err,
          );
        }
      }

      setImportProgress(null);

      if (newPages.length === 0) {
        setErrorMessage(
          "Could not process any of the selected images. Please try different files.",
        );
        setState("error");
        return;
      }

      // The last processed image becomes the current preview;
      // all earlier ones go directly into the pages array.
      const lastEntry = newPages[newPages.length - 1];
      const restEntries = newPages.slice(0, -1);

      setPages((prev) => [...prev, ...restEntries]);
      setCapturedImage(lastEntry.original);
      setProcessedImage(lastEntry.processed);
      setCurrentFilter(lastEntry.filter);
      setDisplayImage(null);
      setCropCorners(null);
      capturedImageDataRef.current = null;

      setState("preview");

      // Reset the file input so the same files can be re-selected
      e.target.value = "";
    },
    [],
  );

  /** Save current capture to pages and open the file picker. */
  const addFromPhotos = useCallback(() => {
    if (!capturedImage) return;
    const entry: PageEntry = {
      processed: processedImage,
      original: capturedImage,
      filter: currentFilter,
    };
    setPages((prev) => [...prev, entry]);
    setCapturedImage(null);
    setProcessedImage(null);
    setCurrentFilter("auto");
    setDisplayImage(null);
    setCropCorners(null);
    capturedImageDataRef.current = null;
    // Open the file picker
    fileInputRef.current?.click();
  }, [capturedImage, processedImage, currentFilter]);

  /** Save current capture to pages and start the camera. */
  const addFromCamera = useCallback(() => {
    if (!capturedImage) return;
    const entry: PageEntry = {
      processed: processedImage,
      original: capturedImage,
      filter: currentFilter,
    };
    setPages((prev) => [...prev, entry]);
    startCamera();
  }, [capturedImage, processedImage, currentFilter, startCamera]);

  useEffect(() => {
    if (state !== "adjusting" || !capturedImage || !cropCorners) return;

    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(image, 0, 0);
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const points = [cropCorners.tl, cropCorners.tr, cropCorners.br, cropCorners.bl];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(image, 0, 0);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.lineWidth = Math.max(4, canvas.width / 250);
      ctx.strokeStyle = "white";
      ctx.stroke();

      const radius = Math.max(14, canvas.width / 45);
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.lineWidth = Math.max(3, canvas.width / 350);
        ctx.strokeStyle = "#4f46e5";
        ctx.stroke();
      }
    };
    image.src = capturedImage;
  }, [state, capturedImage, cropCorners]);

  // Stop camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Compute filtered display image whenever filter or base image changes
  useEffect(() => {
    if (state !== "preview" || !capturedImage) {
      setDisplayImage(null);
      return;
    }

    let cancelled = false;
    setIsComputingFilter(true);

    const sourceUrl = getSourceForFilter(
      capturedImage,
      processedImage,
      currentFilter,
    );

    applyFilter(sourceUrl, currentFilter).then((filtered) => {
      if (!cancelled) {
        setDisplayImage(filtered);
        setIsComputingFilter(false);
      }
    }).catch(() => {
      if (!cancelled) {
        // On error, fall back to source image
        setDisplayImage(sourceUrl);
        setIsComputingFilter(false);
      }
    });

    return () => { cancelled = true; };
  }, [state, capturedImage, processedImage, currentFilter]);

  // Determine which image to show in preview
  const previewImage = displayImage || capturedImage;
  const totalPages = pages.length + 1; // saved pages + current capture

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {state === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              DocSnap
            </h1>
            <p className="max-w-sm text-gray-400">
              Snap a document with your camera and download it as a PDF —
              instantly, no account needed.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
              </svg>
              Open Camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-gray-600 bg-gray-800 px-8 py-4 text-lg font-semibold text-gray-200 shadow-lg transition hover:border-gray-400 hover:bg-gray-700 active:scale-95"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              Choose from Photos
            </button>
          </div>
          {/* Hidden file input for selecting images from device */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {state === "active" && (
        <div className="relative flex flex-1 flex-col">
          {/* Page count badge when pages are already saved */}
          {pages.length > 0 && (
            <div className="absolute left-0 right-0 top-0 z-10 flex justify-center pt-3">
              <span className="rounded-full bg-gray-900/80 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur-sm">
                {pages.length} {pages.length === 1 ? "page" : "pages"} saved
              </span>
            </div>
          )}

          {/* Video preview fills available space */}
          <div className="relative flex-1 bg-black">
            <video
              ref={attachVideo}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>

          {/* Capture button bar */}
          <div className="flex items-center justify-center bg-gray-950 px-6 py-6">
            <button
              onClick={capture}
              className="group relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white shadow-lg transition active:scale-95"
              aria-label="Capture photo"
            >
              <div className="h-14 w-14 rounded-full bg-gray-200 transition group-hover:bg-gray-300" />
            </button>
          </div>
        </div>
      )}

      {state === "processing" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          {/* Show a thumbnail of what was captured while processing (camera flow) */}
          {!importProgress && capturedImage && (
            <div className="w-full max-w-sm overflow-hidden rounded-lg bg-black/50">
              <img
                src={capturedImage}
                alt="Captured document"
                className="w-full object-contain opacity-50"
              />
            </div>
          )}
          {/* File import progress */}
          {importProgress && (
            <div className="w-full max-w-sm space-y-3">
              <div className="overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-center text-sm text-gray-400">
                Processing {importProgress.current} of {importProgress.total}…
              </p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-gray-300">Processing…</p>
          </div>
          <p className="text-sm text-gray-500">
            {importProgress
              ? "Detecting document edges in selected images"
              : "Detecting document edges"}
          </p>
        </div>
      )}

      {state === "adjusting" && capturedImage && cropCorners && (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="px-4 py-3 text-center">
            <h2 className="text-lg font-semibold">Adjust document corners</h2>
            <p className="text-sm text-gray-400">Drag each circle to a document corner.</p>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-3 min-h-0">
            <canvas
              ref={cropCanvasRef}
              className="max-h-full max-w-full touch-none object-contain"
              onPointerDown={beginCornerDrag}
              onPointerMove={updateCornerFromPointer}
              onPointerUp={endCornerDrag}
              onPointerCancel={endCornerDrag}
            />
          </div>

          <div className="flex items-center justify-center gap-3 bg-gray-950 px-4 py-5">
            <button
              onClick={retake}
              className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-300 transition active:scale-95"
            >
              Retake
            </button>
            <button
              onClick={applyManualCrop}
              className="rounded-full bg-indigo-600 px-7 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-95"
            >
              Apply Crop
            </button>
          </div>
        </div>
      )}

      {state === "preview" && previewImage && (
        <div className="flex flex-1 flex-col">
          {/* Captured / processed image preview */}
          <div className="relative flex-1 bg-black min-h-0">
            {isComputingFilter && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            )}
            <img
              src={previewImage}
              alt="Document preview"
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>

          {/* Filter strip */}
          <div className="bg-gray-900 px-3 py-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {ALL_FILTERS.map((f) => {
                const isActive = f === currentFilter;
                return (
                  <button
                    key={f}
                    onClick={() => setCurrentFilter(f)}
                    disabled={isComputingFilter}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thumbnail strip of saved pages */}
          {pages.length > 0 && (
            <div className="bg-gray-900 px-4 py-3">
              {pages.length === 1 ? (
                /* Single page: simple layout, no drag UI */
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {pages.map((page, i) => {
                    const thumbSrc =
                      page.filter === "color"
                        ? page.original
                        : (page.processed || page.original);
                    return (
                      <div
                        key={page.original.slice(-40)}
                        className="relative shrink-0"
                      >
                        <img
                          src={thumbSrc}
                          alt={`Page ${i + 1}`}
                          className="h-16 w-12 rounded-md border border-gray-700 object-cover"
                        />
                        <button
                          onClick={() => deletePage(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-xs leading-none shadow transition hover:bg-red-500 active:scale-90"
                          aria-label={`Remove page ${i + 1}`}
                        >
                          ×
                        </button>
                        <span className="mt-0.5 block text-center text-[10px] text-gray-500">
                          {i + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Multi-page: drag-and-drop reorder enabled */
                <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none">
                  {pages.map((page, i) => {
                    const thumbSrc =
                      page.filter === "color"
                        ? page.original
                        : (page.processed || page.original);

                    const drag = dragRef.current;
                    const isDragging = drag !== null && drag.index === i;
                    const isDragOver =
                      drag !== null &&
                      drag.overIndex === i &&
                      drag.index !== i;

                    // Compute transform to shift items out of the dragged item's way.
                    // Items between the drag origin and the target slot slide one slot over.
                    let shiftTransform = "";
                    if (drag !== null && !isDragging) {
                      if (
                        drag.index < i &&
                        i <= drag.overIndex
                      ) {
                        shiftTransform = `translateX(-${SLOT_WIDTH}px)`;
                      } else if (
                        drag.index > i &&
                        i >= drag.overIndex
                      ) {
                        shiftTransform = `translateX(${SLOT_WIDTH}px)`;
                      }
                    }

                    return (
                      <div
                        key={page.original.slice(-40)}
                        className="relative shrink-0"
                        style={{
                          transform: isDragging
                            ? `translateX(${drag?.deltaX ?? 0}px)`
                            : shiftTransform,
                          transition:
                            drag === null
                              ? "transform 200ms ease"
                              : "none",
                          zIndex: isDragging ? 10 : undefined,
                        }}
                      >
                        {/* Drag handle — only visible when multiple pages */}
                        <div
                          onPointerDown={(e) =>
                            handleDragPointerDown(e, i)
                          }
                          onPointerMove={handleDragPointerMove}
                          onPointerUp={handleDragPointerUp}
                          onPointerCancel={handleDragPointerCancel}
                          className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center text-gray-500 transition hover:text-gray-300 active:cursor-grabbing touch-none select-none"
                          aria-label={`Drag page ${i + 1} to reorder`}
                          title="Drag to reorder"
                        >
                          ☰
                        </div>

                        {/* Thumbnail image */}
                        <img
                          src={thumbSrc}
                          alt={`Page ${i + 1}`}
                          className={`ml-6 h-16 w-12 rounded-md border object-cover transition-shadow ${
                            isDragging
                              ? "border-indigo-400 shadow-lg shadow-indigo-500/30 scale-105"
                              : isDragOver
                                ? "border-indigo-400 ring-2 ring-indigo-400/50"
                                : "border-gray-700"
                          }`}
                          draggable={false}
                        />

                        {/* Delete button */}
                        <button
                          onClick={() => deletePage(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-xs leading-none shadow transition hover:bg-red-500 active:scale-90"
                          aria-label={`Remove page ${i + 1}`}
                        >
                          ×
                        </button>

                        {/* Page number */}
                        <span className="ml-6 mt-0.5 block text-center text-[10px] text-gray-500">
                          {i + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-1 text-center text-xs text-gray-500">
                {pages.length} {pages.length === 1 ? "page" : "pages"} saved
                {pages.length === 1
                  ? " — tap × to remove"
                  : " — drag ☰ to reorder, tap × to remove"}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 bg-gray-950 px-4 py-5">
            <button
              onClick={retake}
              disabled={isGenerating}
              className="rounded-full border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white active:scale-95 disabled:opacity-40"
            >
              Retake
            </button>
            <button
              onClick={addFromCamera}
              disabled={isGenerating}
              className="rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-300 active:scale-95 disabled:opacity-40"
            >
              <span className="hidden sm:inline">Add from </span>Camera
            </button>
            <button
              onClick={addFromPhotos}
              disabled={isGenerating}
              className="rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-300 active:scale-95 disabled:opacity-40"
            >
              <span className="hidden sm:inline">Add from </span>Photos
            </button>
            <button
              onClick={startOCR}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-95 disabled:opacity-40"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating…
                </>
              ) : (
                `Done (${totalPages} ${totalPages === 1 ? "page" : "pages"})`
              )}
            </button>
          </div>
        </div>
      )}

      {state === "ocr" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <div className="space-y-3">
            {/* Language pill — future-proofed for multi-language OCR */}
            <div className="mx-auto flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-900/50 px-3 py-1 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.657 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802"
                  />
                </svg>
                EN
              </span>
            </div>

            {/* OCR progress icon */}
            {!isGenerating && ocrProgress ? (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                  />
                </svg>
              </div>
            ) : (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              </div>
            )}

            <h2 className="text-2xl font-bold tracking-tight">
              {isGenerating
                ? "Generating PDF…"
                : ocrProgress
                  ? "Recognizing text…"
                  : "Preparing…"}
            </h2>

            {/* Progress bar and page counter */}
            {ocrProgress && (
              <div className="w-full max-w-xs space-y-2">
                <div className="overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all duration-500"
                    style={{
                      width: `${Math.round((ocrProgress.page / ocrProgress.totalPages) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-400">
                  Page {ocrProgress.page} of {ocrProgress.totalPages}
                  {ocrProgress.status === "failed" && (
                    <span className="ml-1 text-amber-400">(text detection skipped)</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button
              onClick={skipOCR}
              disabled={isGenerating}
              className="rounded-full border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:bg-gray-700 active:scale-95 disabled:opacity-40"
            >
              Skip OCR
            </button>
            {!isGenerating && (
              <p className="text-xs text-gray-500">
                OCR makes your PDF searchable — it runs entirely in your browser
              </p>
            )}
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p className="max-w-sm text-gray-300">{errorMessage}</p>
          <button
            onClick={() => {
              setErrorMessage("");
              startCamera();
            }}
            className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95"
          >
            Try Again
          </button>
        </div>
      )}
    </main>
  );
}
