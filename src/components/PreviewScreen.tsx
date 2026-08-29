import { useCallback, useEffect, useRef, useState } from "react";
import { FilterToolbar } from "./FilterToolbar";
import { PageStrip } from "./PageStrip";
import { PDFActions } from "./PDFActions";
import type { FilterType } from "../imageFilters";
import type { PageEntry } from "../hooks/usePages";
import { recognizePage } from "../ocr";
import { detectSensitiveInfo } from "../sensitiveDetector";
import { RedactionTool, mergeRedactions, type Redaction, type SuggestResult } from "./RedactionTool";

interface PreviewScreenProps {
  previewImage: string;
  filterPulseKey: number;
  isComputingFilter: boolean;
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  pages: PageEntry[];
  newPageIndices: number[];
  dragRef: React.MutableRefObject<{
    index: number;
    startX: number;
    deltaX: number;
    overIndex: number;
  } | null>;
  pageCount: number;
  isGenerating: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  isSignedIn: boolean;
  cloudConfigured: boolean;
  /** True when the user has connected a SecureVault vault (opt-in). */
  secureVaultConfigured: boolean;
  /** Number of documents currently in cloud storage */
  cloudDocCount: number;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  isPro: boolean;
  password: string;
  passwordEnabled: boolean;
  onPasswordEnabledChange: (enabled: boolean) => void;
  onPasswordChange: (password: string) => void;
  onDeletePage: (index: number) => void;
  onDragPointerDown: (e: React.PointerEvent, index: number) => void;
  onDragPointerMove: (e: React.PointerEvent) => void;
  onDragPointerUp: (e: React.PointerEvent) => void;
  onDragPointerCancel: (e: React.PointerEvent) => void;
  onRetake: () => void;
  onAddFromCamera: () => void;
  onAddFromPhotos: () => void;
  documentName: string;
  onDocumentNameChange: (name: string) => void;
  onSaveToCloud: () => void;
  onSaveToVault: () => void;
  onConnectVault: () => void;
  isVaultSaving: boolean;
  vaultSaveState: "idle" | "success" | "error";
  onDone: () => void;
  isDesktop: boolean;
  redactions: Redaction[];
  redactionMode: boolean;
  onRedactionChange: (r: Redaction[]) => void;
  onRedactionModeChange: (open: boolean) => void;
  /** True when a free user tapped Redact — shows the inline upgrade prompt. */
  redactionUpgrade: boolean;
  onRedactionUpgradeDismiss: () => void;
}

export function PreviewScreen({
  previewImage,
  filterPulseKey,
  isComputingFilter,
  currentFilter,
  onFilterChange,
  pages,
  newPageIndices,
  dragRef,
  pageCount,
  isGenerating,
  isSaving,
  saveSuccess,
  isSignedIn,
  cloudConfigured,
  secureVaultConfigured,
  cloudDocCount,
  docLimit,
  upgradeUrl,
  isPro,
  password,
  passwordEnabled,
  onPasswordEnabledChange,
  onPasswordChange,
  onDeletePage,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
  onRetake,
  onAddFromCamera,
  onAddFromPhotos,
  documentName,
  onDocumentNameChange,
  onSaveToCloud,
  onSaveToVault,
  onConnectVault,
  isVaultSaving,
  vaultSaveState,
  onDone,
  isDesktop, redactions, redactionMode, onRedactionChange, onRedactionModeChange, redactionUpgrade, onRedactionUpgradeDismiss,
}: PreviewScreenProps) {
  // Redactions live in the image's natural pixel space; load the preview to
  // learn its natural size so the overlay can be letterboxed to match the
  // object-contain <img> exactly (via an SVG viewBox + preserveAspectRatio).
  const [natDims, setNatDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = previewImage;
  }, [previewImage]);

  // ── Auto-detect sensitive info (Pro) ──────────────────────────────
  // OCR the SAME imageUrl the RedactionTool canvas displays, so detected
  // boxes land 1:1 in the canvas's pixel space (image natural dimensions).
  const [suggest, setSuggest] = useState<SuggestResult>({ status: "idle", message: "", added: 0 });
  // Refs keep the async completion honest: it merges against the LATEST
  // redactions (user may draw while scanning) and is discarded if the user
  // already left redaction mode.
  const redactionsRef = useRef(redactions);
  const redactionModeRef = useRef(redactionMode);
  useEffect(() => { redactionsRef.current = redactions; }, [redactions]);
  useEffect(() => { redactionModeRef.current = redactionMode; }, [redactionMode]);
  // Fresh status every time redaction mode opens/closes — no stale results.
  useEffect(() => { setSuggest({ status: "idle", message: "", added: 0 }); }, [redactionMode]);

  const handleSuggest = useCallback(async () => {
    if (!isPro || !previewImage) return;
    setSuggest({ status: "busy", message: "Scanning page for sensitive info…", added: 0 });
    try {
      const words = await recognizePage(previewImage);
      if (!redactionModeRef.current) return; // user left redaction mode mid-scan
      const items = detectSensitiveInfo(words);
      if (items.length === 0) {
        setSuggest({ status: "none", message: "No sensitive info detected", added: 0 });
        return;
      }
      const boxes: Redaction[] = items.map((i) => ({
        x: i.position.x, y: i.position.y, width: i.position.width, height: i.position.height,
      }));
      const current = redactionsRef.current;
      const merged = mergeRedactions(current, boxes);
      const added = merged.length - current.length;
      onRedactionChange(merged);
      setSuggest({ status: "ok", message: `${added} sensitive item${added === 1 ? "" : "s"} found — added`, added });
    } catch (err) {
      console.error("Auto-detect redactions failed:", err);
      if (!redactionModeRef.current) return;
      setSuggest({ status: "error", message: "Couldn't scan this page — you can still draw redactions manually", added: 0 });
    }
  }, [isPro, previewImage, onRedactionChange]);

  return (
    <div className="flex flex-1 flex-col animate-fade-in">
      {redactionMode ? <RedactionTool imageUrl={previewImage} redactions={redactions} onChange={onRedactionChange} onApply={() => onRedactionModeChange(false)} onCancel={() => onRedactionModeChange(false)} suggestEnabled={isPro} suggest={suggest} onSuggest={handleSuggest} /> : <>
      {/* Image preview */}
      <div className="relative flex-1 bg-black min-h-0">
        {isComputingFilter && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}
        <img
          key={filterPulseKey}
          src={previewImage}
          alt="Document preview"
          className="absolute inset-0 h-full w-full object-contain animate-pulse-filter"
        />
        {/* Burned redactions for the current page, overlaid in image coordinates */}
        {redactions.length > 0 && natDims && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${natDims.w} ${natDims.h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-label="Redacted areas"
          >
            {redactions.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill="#000" />
            ))}
          </svg>
        )}
        {redactions.length > 0 && (
          <div className="absolute left-3 top-3 z-10">
            <span className="rounded-full bg-gray-900/70 px-2.5 py-1 text-[11px] text-gray-400 backdrop-blur-sm">
              ▰ {redactions.length} redaction{redactions.length === 1 ? "" : "s"} applied
            </span>
          </div>
        )}
        {/* Desktop keyboard hint */}
        {isDesktop && (
          <div className="absolute right-3 top-3 z-10">
            <span className="rounded-full bg-gray-900/70 px-2.5 py-1 text-[11px] text-gray-500 backdrop-blur-sm">
              <kbd className="font-mono text-gray-400">R</kbd> retake · <kbd className="font-mono text-gray-400">D</kbd> done · <kbd className="font-mono text-gray-400">1–6</kbd> filter
            </span>
          </div>
        )}
      </div>

      {/* Filter strip */}
      <FilterToolbar
        currentFilter={currentFilter}
        onFilterChange={onFilterChange}
        disabled={isComputingFilter}
      />

      {/* Thumbnail strip of saved pages */}
      {pages.length > 0 && (
        <PageStrip
          pages={pages}
          newPageIndices={newPageIndices}
          dragRef={dragRef}
          onDelete={onDeletePage}
          onDragPointerDown={onDragPointerDown}
          onDragPointerMove={onDragPointerMove}
          onDragPointerUp={onDragPointerUp}
          onDragPointerCancel={onDragPointerCancel}
        />
      )}

      {/* Action buttons */}
      <PDFActions
        pageCount={pageCount}
        isGenerating={isGenerating}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
        isSignedIn={isSignedIn}
        cloudConfigured={cloudConfigured}
        secureVaultConfigured={secureVaultConfigured}
        cloudDocCount={cloudDocCount}
        docLimit={docLimit}
        upgradeUrl={upgradeUrl}
        isPro={isPro}
        password={password}
        passwordEnabled={passwordEnabled}
        onPasswordEnabledChange={onPasswordEnabledChange}
        onPasswordChange={onPasswordChange}
        onRetake={onRetake}
        onAddFromCamera={onAddFromCamera}
        onAddFromPhotos={onAddFromPhotos}
        documentName={documentName}
        onDocumentNameChange={onDocumentNameChange}
        onSaveToCloud={onSaveToCloud}
        onSaveToVault={onSaveToVault}
        onConnectVault={onConnectVault}
        isVaultSaving={isVaultSaving}
        vaultSaveState={vaultSaveState}
        onDone={onDone}
      />
      <button onClick={() => onRedactionModeChange(true)} className="mx-4 mb-2 rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200">▰ Redact <span className="text-xs text-red-300">(Pro)</span>{redactions.length > 0 && ` · ${redactions.length}`}</button>
      </>}

      {/* Inline upgrade prompt for free users tapping Redact */}
      {redactionUpgrade && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onRedactionUpgradeDismiss}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Redaction is a Pro feature</h3>
            <p className="mt-1.5 text-sm text-gray-400">Upgrade to permanently black out sensitive information in your scanned documents.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={onRedactionUpgradeDismiss} className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800">Not now</button>
              <a href={upgradeUrl} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-indigo-500">Upgrade</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
