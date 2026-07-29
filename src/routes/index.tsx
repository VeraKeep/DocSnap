import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { processDocument } from "../documentProcessor";

type AppState = "idle" | "active" | "processing" | "preview" | "error";

interface PageEntry {
  processed: string | null;
  original: string;
  useOriginal: boolean;
}

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<AppState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [useOriginal, setUseOriginal] = useState(false);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

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
    setUseOriginal(false);

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

    // Draw the video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Get the raw ImageData for processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Store the original capture as a data URL
    const originalDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(originalDataUrl);

    // Stop the camera — we have our frame
    stopCamera();
    setState("processing");

    // Yield to the browser so the "Processing…" UI renders,
    // then run the document detection on the next animation frame
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const result = processDocument(imageData, "image/jpeg", 0.92);
          if (result) {
            setProcessedImage(result.dataUrl);
            setUseOriginal(false);
          } else {
            setProcessedImage(null);
          }
        } catch {
          // If processing throws, just use the original
          setProcessedImage(null);
        }
        setState("preview");
      }, 100);
    });
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCapturedImage(null);
    setProcessedImage(null);
    setUseOriginal(false);
    // Restart the camera
    startCamera();
  }, [startCamera]);

  const addPage = useCallback(() => {
    if (!capturedImage) return;
    const entry: PageEntry = {
      processed: processedImage,
      original: capturedImage,
      useOriginal,
    };
    setPages((prev) => [...prev, entry]);
    // Start camera for the next capture
    startCamera();
  }, [capturedImage, processedImage, useOriginal, startCamera]);

  const deletePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const doneAndDownload = useCallback(async () => {
    if (!capturedImage) return;

    // Build the full list: confirmed pages + current capture
    const allPages: PageEntry[] = [
      ...pages,
      {
        processed: processedImage,
        original: capturedImage,
        useOriginal,
      },
    ];

    setIsGenerating(true);

    try {
      // Dynamically import jsPDF to avoid SSR issues
      const { jsPDF } = await import("jspdf");

      // Use A4 portrait as default page size (in mm)
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        const imageToUse =
          !page.useOriginal && page.processed
            ? page.processed
            : page.original;

        // Load image to get natural dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () =>
            reject(new Error("Failed to load image for PDF"));
          img.src = imageToUse;
        });

        const ratio = Math.min(
          maxWidth / img.naturalWidth,
          maxHeight / img.naturalHeight,
        );
        const drawWidth = img.naturalWidth * ratio;
        const drawHeight = img.naturalHeight * ratio;
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imageToUse, "JPEG", x, y, drawWidth, drawHeight);
      }

      pdf.save("document.pdf");

      // Reset everything
      setPages([]);
      setCapturedImage(null);
      setProcessedImage(null);
      setUseOriginal(false);
      setState("idle");
    } catch {
      setErrorMessage("Failed to generate PDF. Please try again.");
      setState("error");
    } finally {
      setIsGenerating(false);
    }
  }, [pages, capturedImage, processedImage, useOriginal]);

  // Stop camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Determine which image to show in preview
  const previewImage =
    !useOriginal && processedImage ? processedImage : capturedImage;
  const hasProcessedImage = processedImage !== null;
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
          {/* Show a thumbnail of what was captured while processing */}
          {capturedImage && (
            <div className="w-full max-w-sm overflow-hidden rounded-lg bg-black/50">
              <img
                src={capturedImage}
                alt="Captured document"
                className="w-full object-contain opacity-50"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-gray-300">Processing…</p>
          </div>
          <p className="text-sm text-gray-500">Detecting document edges</p>
        </div>
      )}

      {state === "preview" && previewImage && (
        <div className="flex flex-1 flex-col">
          {/* Captured / processed image preview */}
          <div className="relative flex-1 bg-black min-h-0">
            <img
              src={previewImage}
              alt={
                !useOriginal && hasProcessedImage
                  ? "Processed document"
                  : "Captured document"
              }
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>

          {/* Toggle for original vs processed */}
          {hasProcessedImage && (
            <div className="flex items-center justify-center bg-gray-900 px-6 py-2">
              <button
                onClick={() => setUseOriginal((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-gray-400 transition hover:text-white"
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full border ${
                    useOriginal
                      ? "border-gray-500 bg-transparent"
                      : "border-indigo-500 bg-indigo-500"
                  }`}
                />
                {useOriginal ? "Use auto-crop" : "Use original"}
              </button>
            </div>
          )}

          {/* Thumbnail strip of saved pages */}
          {pages.length > 0 && (
            <div className="bg-gray-900 px-4 py-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {pages.map((page, i) => {
                  const thumbSrc =
                    !page.useOriginal && page.processed
                      ? page.processed
                      : page.original;
                  return (
                    <div
                      key={`${i}-${page.original.slice(-20)}`}
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
              <p className="mt-1 text-center text-xs text-gray-500">
                {pages.length} {pages.length === 1 ? "page" : "pages"} saved
                {pages.length > 0 && ` — tap × to remove`}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 bg-gray-950 px-4 py-5">
            <button
              onClick={retake}
              disabled={isGenerating}
              className="rounded-full border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white active:scale-95 disabled:opacity-40"
            >
              Retake
            </button>
            <button
              onClick={addPage}
              disabled={isGenerating}
              className="rounded-full border border-indigo-500/50 px-5 py-3 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:text-indigo-300 active:scale-95 disabled:opacity-40"
            >
              Add Page
            </button>
            <button
              onClick={doneAndDownload}
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
              setPages([]);
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
