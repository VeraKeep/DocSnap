import type { PageEntry } from "../hooks/usePages";
import { SLOT_WIDTH } from "../hooks/usePages";

interface PageStripProps {
  pages: PageEntry[];
  newPageIndices: number[];
  dragRef: React.MutableRefObject<{
    index: number;
    startX: number;
    deltaX: number;
    overIndex: number;
  } | null>;
  onDelete: (index: number) => void;
  onDragPointerDown: (e: React.PointerEvent, index: number) => void;
  onDragPointerMove: (e: React.PointerEvent) => void;
  onDragPointerUp: (e: React.PointerEvent) => void;
  onDragPointerCancel: (e: React.PointerEvent) => void;
}

export function PageStrip({
  pages,
  newPageIndices,
  dragRef,
  onDelete,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
}: PageStripProps) {
  if (pages.length === 0) return null;

  return (
    <div className="bg-gray-900 px-4 py-3">
      {pages.length === 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {pages.map((page, i) => {
            const thumbSrc =
              page.filter === "color"
                ? page.original
                : (page.processed || page.original);
            return (
              <div
                key={`page-${i}-${page.original.slice(-20)}`}
                className={`relative shrink-0 ${newPageIndices.includes(i) ? "animate-slide-in" : ""}`}
              >
                <img
                  src={thumbSrc}
                  alt={`Page ${i + 1}`}
                  className="h-16 w-12 rounded-md border border-gray-700 object-cover"
                />
                <button
                  onClick={() => onDelete(i)}
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

            let shiftTransform = "";
            if (drag !== null && !isDragging) {
              if (drag.index < i && i <= drag.overIndex) {
                shiftTransform = `translateX(-${SLOT_WIDTH}px)`;
              } else if (drag.index > i && i >= drag.overIndex) {
                shiftTransform = `translateX(${SLOT_WIDTH}px)`;
              }
            }

            return (
              <div
                key={`page-${i}-${page.original.slice(-20)}`}
                className={`relative shrink-0 ${newPageIndices.includes(i) ? "animate-slide-in" : ""}`}
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
                <div
                  onPointerDown={(e) => onDragPointerDown(e, i)}
                  onPointerMove={onDragPointerMove}
                  onPointerUp={onDragPointerUp}
                  onPointerCancel={onDragPointerCancel}
                  className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center text-gray-500 transition hover:text-gray-300 active:cursor-grabbing touch-none select-none"
                  aria-label={`Drag page ${i + 1} to reorder`}
                  title="Drag to reorder"
                >
                  ☰
                </div>

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

                <button
                  onClick={() => onDelete(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-xs leading-none shadow transition hover:bg-red-500 active:scale-90"
                  aria-label={`Remove page ${i + 1}`}
                >
                  ×
                </button>

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
  );
}
