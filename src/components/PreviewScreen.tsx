import { FilterToolbar } from "./FilterToolbar";
import { PageStrip } from "./PageStrip";
import { PDFActions } from "./PDFActions";
import type { FilterType } from "../imageFilters";
import type { PageEntry } from "../hooks/usePages";

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
  onDeletePage: (index: number) => void;
  onDragPointerDown: (e: React.PointerEvent, index: number) => void;
  onDragPointerMove: (e: React.PointerEvent) => void;
  onDragPointerUp: (e: React.PointerEvent) => void;
  onDragPointerCancel: (e: React.PointerEvent) => void;
  onRetake: () => void;
  onAddFromCamera: () => void;
  onAddFromPhotos: () => void;
  onSaveToCloud: () => void;
  onDone: () => void;
  isDesktop: boolean;
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
  onDeletePage,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
  onRetake,
  onAddFromCamera,
  onAddFromPhotos,
  onSaveToCloud,
  onDone,
  isDesktop,
}: PreviewScreenProps) {
  return (
    <div className="flex flex-1 flex-col animate-fade-in">
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
        onRetake={onRetake}
        onAddFromCamera={onAddFromCamera}
        onAddFromPhotos={onAddFromPhotos}
        onSaveToCloud={onSaveToCloud}
        onDone={onDone}
      />
    </div>
  );
}
