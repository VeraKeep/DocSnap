import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { processDocument, perspectiveWarp, type Quad } from "../documentProcessor";
import { applyFilter, getSourceForFilter, type FilterType } from "../imageFilters";
import { ocrEnabled } from "../ocr";
import { recognizePages as ocrRecognizePages } from "../ocr";
import { ocrWordsToText } from "../documentCategorizer";
import { generatePlainPDF } from "../searchablePdf";
import type { PageEntry } from "../hooks/usePages";
import { useCamera } from "../hooks/useCamera";
import { usePages } from "../hooks/usePages";
import { useOCR } from "../hooks/useOCR";
import { useCloudSync } from "../hooks/useCloudSync";
import { useKeyboardShortcuts, useIsDesktop } from "../hooks/useKeyboardShortcuts";
import { trackEvent } from "../analytics";
import type { DocCategory } from "../cloudStorage";
import { CameraView } from "../components/CameraView";
import { PreviewScreen } from "../components/PreviewScreen";
import { OCRProgress } from "../components/OCRProgress";
import { LandingPage } from "../components/LandingPage";
import { ProcessingScreen } from "../components/ProcessingScreen";
import { ErrorScreen } from "../components/ErrorScreen";

type AppState = "idle" | "active" | "processing" | "adjusting" | "preview" | "ocr" | "error";
type CornerName = keyof Quad;

function createDefaultCorners(width: number, height: number): Quad {
  const insetX = width * 0.08;
  const insetY = height * 0.08;
  return { tl: { x: insetX, y: insetY }, tr: { x: width - insetX, y: insetY }, br: { x: width - insetX, y: height - insetY }, bl: { x: insetX, y: height - insetY } };
}

function vibrate(ms: number) { try { navigator.vibrate?.(ms); } catch { /* ignore */ } }

const homeStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "DocSnap",
  description:
    "Scan documents to PDF instantly using your camera — no account, no upload, no Adobe license. Everything runs locally in your browser.",
  url: "https://docsnapapp.com",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "DocSnap — Scan documents to PDF",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(homeStructuredData),
      },
    ],
  }),
  component: Home,
});

function Home() {
  // ── Hooks ──
  const { canvasRef, startCamera: startCameraBase, stopCamera, captureFrame, attachVideo, cameraState, error: cameraError } = useCamera();
  const { pages, addPage, addPages, deletePage, resetPages, newPageIndices, dragRef, handleDragPointerDown, handleDragPointerMove, handleDragPointerUp, handleDragPointerCancel } = usePages();
  const { runOCR, skipOCR: skipOCRFn, ocrProgress, ocrAbortRef, ocrPhase, categorizationResult } = useOCR();
  const { saveToCloud, isSaving, saveSuccess, isCloudReady: cloudConfigured, myScans: savedDocs, deleteScan, updateDocCategory, loadingDocs, deletingDocId, authLoaded, isSignedIn, user } = useCloudSync();
  const isDesktop = useIsDesktop();

  // ── App state ──
  const [state, setState] = useState<AppState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [currentFilter, setCurrentFilter] = useState<FilterType>("auto");
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [isComputingFilter, setIsComputingFilter] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [cropCorners, setCropCorners] = useState<Quad | null>(null);
  const [showCaptureFlash, setShowCaptureFlash] = useState(false);
  const [filterPulseKey, setFilterPulseKey] = useState(0);
  const [showMyScans, setShowMyScans] = useState(false);
  const [ocrPagesForProcessing, setOcrPagesForProcessing] = useState<PageEntry[] | null>(null);
  const [showShortcutsHint, setShowShortcutsHint] = useState(false);

  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCornerRef = useRef<CornerName | null>(null);
  const capturedImageDataRef = useRef<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Filter names for shortcuts ──
  const filterOrder: FilterType[] = ["auto", "bw", "grayscale", "highContrast", "receipt", "color"];

  // ── Camera orchestration ──
  const startCamera = useCallback(async () => {
    trackEvent("open-camera");
    setErrorMessage(""); setCapturedImage(null); setProcessedImage(null);
    setCurrentFilter("auto"); setDisplayImage(null); setCropCorners(null);
    capturedImageDataRef.current = null;
    const stream = await startCameraBase();
    if (stream) setState("active");
  }, [startCameraBase]);

  useEffect(() => { if (cameraState === "error" && cameraError) { setErrorMessage(cameraError); setState("error"); } }, [cameraState, cameraError]);

  const capture = useCallback(() => {
    const result = captureFrame(); if (!result) return;
    trackEvent("capture-photo", { source: "camera" });
    vibrate(10); capturedImageDataRef.current = result.imageData;
    setCapturedImage(result.dataUrl); setShowCaptureFlash(true);
    setTimeout(() => setShowCaptureFlash(false), 350);
    stopCamera(); setState("processing");
    requestAnimationFrame(() => { setTimeout(() => {
      try {
        const docResult = processDocument(result.imageData, "image/jpeg", 0.92);
        if (docResult) { setProcessedImage(docResult.dataUrl); setState("preview"); }
        else { setCropCorners(createDefaultCorners(result.width, result.height)); setState("adjusting"); }
      } catch (error) { console.error("Auto-crop failed:", error); setCropCorners(createDefaultCorners(result.width, result.height)); setState("adjusting"); }
    }, 100); });
  }, [captureFrame, stopCamera]);

  const retake = useCallback(() => {
    vibrate(10); setCapturedImage(null); setProcessedImage(null);
    setCurrentFilter("auto"); setDisplayImage(null); setCropCorners(null);
    capturedImageDataRef.current = null; startCamera();
  }, [startCamera]);

  const closeCamera = useCallback(() => {
    stopCamera(); setState("idle");
  }, [stopCamera]);

  // ── Crop editor ──
  const applyManualCrop = useCallback(() => {
    vibrate(10); const imageData = capturedImageDataRef.current;
    if (!imageData || !cropCorners) return;
    try { const cropped = perspectiveWarp(imageData, imageData.width, imageData.height, cropCorners, "image/jpeg", 0.92); setProcessedImage(cropped); setCurrentFilter("auto"); setDisplayImage(null); setState("preview"); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Unable to crop image"); setState("error"); }
  }, [cropCorners]);

  const updateCorner = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current, ac = activeCornerRef.current;
    if (!canvas || !ac) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setCropCorners(c => c ? { ...c, [ac]: { x: Math.max(0, Math.min(canvas.width - 1, x)), y: Math.max(0, Math.min(canvas.height - 1, y)) } } : c);
  }, []);

  const beginDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current; if (!canvas || !cropCorners) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width, y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const names: CornerName[] = ["tl","tr","br","bl"];
    activeCornerRef.current = names.reduce((n, name) => { const a = cropCorners[n], b = cropCorners[name]; return (Math.hypot(b.x-x, b.y-y) < Math.hypot(a.x-x, a.y-y)) ? name : n; }, names[0]);
    canvas.setPointerCapture(e.pointerId); updateCorner(e);
  }, [cropCorners, updateCorner]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => { activeCornerRef.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }, []);

  // ── Pages ──
  const buildAllPages = useCallback((): PageEntry[] => {
    if (!capturedImage) return [...pages];
    return [...pages, { processed: processedImage, original: capturedImage, filter: currentFilter, thumbnail: "" }];
  }, [pages, capturedImage, processedImage, currentFilter]);

  const resetApp = useCallback(() => {
    resetPages(); setCapturedImage(null); setProcessedImage(null);
    setCurrentFilter("auto"); setDisplayImage(null); setCropCorners(null);
    setOcrPagesForProcessing(null); capturedImageDataRef.current = null; setState("idle");
  }, [resetPages]);

  const downloadBlob = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "document.pdf"; document.body.appendChild(a);
    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, []);

  const addFromCamera = useCallback(() => {
    vibrate(10); if (!capturedImage) return;
    addPage({ processed: processedImage, original: capturedImage, filter: currentFilter, thumbnail: "" }); startCamera();
  }, [capturedImage, processedImage, currentFilter, addPage, startCamera]);

  const addFromPhotos = useCallback(() => {
    vibrate(10); if (!capturedImage) return;
    addPage({ processed: processedImage, original: capturedImage, filter: currentFilter, thumbnail: "" });
    setCapturedImage(null); setProcessedImage(null); setCurrentFilter("auto");
    setDisplayImage(null); setCropCorners(null); capturedImageDataRef.current = null;
    fileInputRef.current?.click();
  }, [capturedImage, processedImage, currentFilter, addPage]);

  // ── OCR flow ──
  const startOCR = useCallback(() => { vibrate(12); if (!capturedImage) return;
    const allPages = buildAllPages();
    trackEvent("generate-pdf", { pages: allPages.length, ocr: ocrEnabled, filter: currentFilter });
    setOcrPagesForProcessing(allPages); setState("ocr"); }, [capturedImage, buildAllPages, currentFilter]);

  useEffect(() => {
    if (state !== "ocr" || !ocrPagesForProcessing) return;
    if (!ocrEnabled) { skipOCRFn(ocrPagesForProcessing).then(b => { if (b) { downloadBlob(b); resetApp(); } }).catch(() => { setErrorMessage("Text recognition couldn't complete for this page. The PDF will still include the scanned image."); setState("error"); }); return; }
    let cancelled = false;
    (async () => { try { const b = await runOCR(ocrPagesForProcessing); if (!cancelled && b) { downloadBlob(b); resetApp(); } }
      catch { if (!cancelled) { try { const b = await skipOCRFn(ocrPagesForProcessing); if (b) { downloadBlob(b); resetApp(); } } catch { setErrorMessage("Text recognition couldn't complete for this page. The PDF will still include the scanned image."); setState("error"); } } }
    })();
    return () => { cancelled = true; };
  }, [state, ocrPagesForProcessing]);

  const handleSkipOCR = useCallback(async () => {
    const allPages = ocrPagesForProcessing; if (!allPages?.length) return;
    ocrAbortRef.current?.abort(); setIsGenerating(true);
    try { const b = await skipOCRFn(allPages); if (b) { downloadBlob(b); resetApp(); } }
    catch { setErrorMessage("Failed to generate PDF."); setState("error"); }
    finally { setIsGenerating(false); ocrAbortRef.current = null; }
  }, [ocrPagesForProcessing, skipOCRFn, downloadBlob, resetApp, ocrAbortRef]);

  // ── Cloud save ──
  const handleSaveToCloud = useCallback(async () => {
    vibrate(12); if (!capturedImage || !isSignedIn || !user?.id) return; setIsGenerating(true);
    try {
      const allPages = buildAllPages();
      trackEvent("save-to-cloud", { pages: allPages.length });
      const pageEntries: { imageUrl: string; imgNaturalWidth: number; imgNaturalHeight: number }[] = [];
      for (const page of allPages) { const src = getSourceForFilter(page.original, page.processed, page.filter); const imgUrl = await applyFilter(src, page.filter); const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Failed")); img.src = imgUrl; }); pageEntries.push({ imageUrl: imgUrl, imgNaturalWidth: img.naturalWidth, imgNaturalHeight: img.naturalHeight }); }
      const blob = await generatePlainPDF(pageEntries, { title: "DocSnap Document" });

      // Attempt OCR text extraction for searchability
      let ocrText = "";
      try {
        const imageUrls = pageEntries.map((p) => p.imageUrl);
        const ocrResults = await ocrRecognizePages(
          imageUrls,
          () => {}, // silent progress — user already sees saving spinner
        );
        ocrText = ocrResults
          .map((words) => ocrWordsToText(words))
          .join(" ")
          .trim();
      } catch (ocrErr) {
        // OCR failed — save without text; search will skip this doc
        console.warn("OCR extraction failed during cloud save:", ocrErr);
      }

      await saveToCloud(blob, allPages.length, categorizationResult?.category || "", ocrText);
    } catch (err) { console.error("Save failed:", err); setErrorMessage("Couldn't save to cloud. Check your connection and try again."); setState("error"); }
    finally { setIsGenerating(false); }
  }, [capturedImage, isSignedIn, user?.id, buildAllPages, saveToCloud, categorizationResult]);

  // ── File import ──
  async function processFile(file: File): Promise<PageEntry> {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Failed")); i.src = URL.createObjectURL(file); });
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("No context"); ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height), url = c.toDataURL("image/jpeg", 0.92); URL.revokeObjectURL(img.src);
    try { const r = processDocument(id, "image/jpeg", 0.92); return { original: url, processed: r?.dataUrl ?? null, filter: "auto", thumbnail: "" }; }
    catch { return { original: url, processed: null, filter: "auto", thumbnail: "" }; }
  }

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    const arr = Array.from(files);
    trackEvent("import-photo", { count: arr.length });
    setImportProgress({ current: 0, total: arr.length }); setState("processing");
    const newPages: PageEntry[] = [];
    for (let i = 0; i < arr.length; i++) { setImportProgress({ current: i + 1, total: arr.length }); await new Promise(r => setTimeout(r, 0)); try { newPages.push(await processFile(arr[i])); } catch (err) { console.error("Failed:", (arr[i] as File).name, err); } }
    setImportProgress(null);
    if (!newPages.length) { setErrorMessage("Could not process images."); setState("error"); return; }
    const last = newPages[newPages.length - 1], rest = newPages.slice(0, -1);
    addPages(rest); setCapturedImage(last.original); setProcessedImage(last.processed);
    setCurrentFilter(last.filter); setDisplayImage(null); setCropCorners(null); capturedImageDataRef.current = null;
    setState("preview"); e.target.value = "";
  }, [addPages]);

  const downloadSavedDoc = useCallback((doc: { fileUrl: string }) => { window.open(doc.fileUrl, "_blank"); }, []);

  // ── Category management ──
  const handleCategoryChange = useCallback(
    (docId: string, cat: DocCategory) => {
      updateDocCategory(docId, cat);
    },
    [updateDocCategory],
  );

  // ── Keyboard shortcuts ──
  useKeyboardShortcuts(isDesktop, {
    capture: state === "active" ? capture : undefined,
    closeCamera: (state === "active" || state === "preview" || state === "adjusting") ? closeCamera : undefined,
    retake: state === "preview" ? retake : undefined,
    done: state === "preview" ? startOCR : undefined,
    filterSwitch: state === "preview" ? (idx) => { if (idx >= 0 && idx < filterOrder.length) setCurrentFilter(filterOrder[idx]); } : undefined,
  });

  // ── Effects ──
  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (state !== "preview" || !capturedImage) { setDisplayImage(null); return; }
    let cancelled = false; setIsComputingFilter(true);
    const src = getSourceForFilter(capturedImage, processedImage, currentFilter);
    applyFilter(src, currentFilter).then(f => { if (!cancelled) { setDisplayImage(f); setIsComputingFilter(false); setFilterPulseKey(k => k + 1); } }).catch(() => { if (!cancelled) { setDisplayImage(src); setIsComputingFilter(false); } });
    return () => { cancelled = true; };
  }, [state, capturedImage, processedImage, currentFilter]);

  useEffect(() => {
    if (state !== "adjusting" || !capturedImage || !cropCorners) return;
    const canvas = cropCanvasRef.current; if (!canvas) return;
    const image = new Image();
    image.onload = () => { canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.drawImage(image, 0, 0); ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const pts = [cropCorners.tl, cropCorners.tr, cropCorners.br, cropCorners.bl]; ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.clip(); ctx.drawImage(image, 0, 0); ctx.restore();
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.lineWidth = Math.max(4, canvas.width/250); ctx.strokeStyle = "white"; ctx.stroke();
      const r = Math.max(14, canvas.width/45); for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fillStyle = "white"; ctx.fill(); ctx.lineWidth = Math.max(3, canvas.width/350); ctx.strokeStyle = "#4f46e5"; ctx.stroke(); } };
    image.src = capturedImage;
  }, [state, capturedImage, cropCorners]);

  const previewImage = displayImage || capturedImage;

  // ── Render ──
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

      {state === "idle" && <LandingPage authLoaded={authLoaded} isSignedIn={isSignedIn ?? false} cloudConfigured={cloudConfigured} showMyScans={showMyScans} savedDocs={savedDocs} loadingDocs={loadingDocs} deletingDocId={deletingDocId} userEmail={user?.primaryEmailAddress?.emailAddress} userName={user?.fullName ?? undefined} onOpenCamera={startCamera} onChoosePhotos={() => { trackEvent("choose-from-photos"); fileInputRef.current?.click(); }} onToggleMyScans={() => setShowMyScans(true)} onCloseMyScans={() => setShowMyScans(false)} onDownloadDoc={downloadSavedDoc} onDeleteDoc={deleteScan} onCategoryChange={handleCategoryChange} />}

      {state === "active" && <CameraView videoRefCallback={attachVideo} showCaptureFlash={showCaptureFlash} savedPageCount={pages.length} onCapture={capture} isDesktop={isDesktop} />}

      {state === "processing" && <ProcessingScreen capturedImage={capturedImage} importProgress={importProgress} />}

      {state === "adjusting" && capturedImage && cropCorners && (
        <div className="flex flex-1 flex-col min-h-0 animate-fade-in">
          <div className="px-4 py-3 text-center"><h2 className="text-lg font-semibold">Adjust document corners</h2><p className="text-sm text-gray-400">Drag each circle to a document corner.</p></div>
          <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-3 min-h-0"><canvas ref={cropCanvasRef} className="max-h-full max-w-full touch-none object-contain" onPointerDown={beginDrag} onPointerMove={updateCorner} onPointerUp={endDrag} onPointerCancel={endDrag} /></div>
          <div className="flex items-center justify-center gap-3 bg-gray-950 px-4 py-5 safe-bottom"><button onClick={retake} className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-300 transition active:scale-95">Retake</button><button onClick={applyManualCrop} className="rounded-full bg-indigo-600 px-7 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-95">Apply Crop</button></div>
        </div>
      )}

      {state === "preview" && previewImage && <PreviewScreen previewImage={previewImage} filterPulseKey={filterPulseKey} isComputingFilter={isComputingFilter} currentFilter={currentFilter} onFilterChange={setCurrentFilter} pages={pages} newPageIndices={newPageIndices} dragRef={dragRef} pageCount={pages.length} isGenerating={isGenerating} isSaving={isSaving} saveSuccess={saveSuccess} isSignedIn={isSignedIn ?? false} cloudConfigured={cloudConfigured} onDeletePage={deletePage} onDragPointerDown={handleDragPointerDown} onDragPointerMove={handleDragPointerMove} onDragPointerUp={handleDragPointerUp} onDragPointerCancel={handleDragPointerCancel} onRetake={retake} onAddFromCamera={addFromCamera} onAddFromPhotos={addFromPhotos} onSaveToCloud={handleSaveToCloud} onDone={startOCR} isDesktop={isDesktop} />}

      {state === "ocr" && <OCRProgress isGenerating={isGenerating || ocrPhase === "assembling"} ocrProgress={ocrProgress} onSkip={handleSkipOCR} />}

      {state === "error" && <ErrorScreen errorMessage={errorMessage} onTryAgain={() => { vibrate(12); setErrorMessage(""); startCamera(); }} />}

      {/* Keyboard shortcuts hint (desktop only, subtle) */}
      {isDesktop && (
        <div className="fixed bottom-4 left-4 z-50">
          <button
            onClick={() => setShowShortcutsHint(!showShortcutsHint)}
            className="flex items-center gap-1.5 rounded-full bg-gray-900/80 px-2.5 py-1.5 text-[11px] text-gray-600 backdrop-blur-sm transition hover:text-gray-400 hover:bg-gray-800/80"
            title="Keyboard shortcuts"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12M6 12h12m-6 6h6" />
            </svg>
            ⌨
          </button>
          {showShortcutsHint && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-gray-700 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm text-left">
              <p className="text-[11px] font-medium text-gray-400 mb-2">Keyboard shortcuts</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span className="text-gray-500">Capture photo</span><kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300 font-mono text-[10px]">Space</kbd></div>
                <div className="flex justify-between"><span className="text-gray-500">Done / download</span><kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300 font-mono text-[10px]">D</kbd></div>
                <div className="flex justify-between"><span className="text-gray-500">Retake</span><kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300 font-mono text-[10px]">R</kbd></div>
                <div className="flex justify-between"><span className="text-gray-500">Close camera</span><kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300 font-mono text-[10px]">Esc</kbd></div>
                <div className="flex justify-between"><span className="text-gray-500">Switch filter</span><kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300 font-mono text-[10px]">1–6</kbd></div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
