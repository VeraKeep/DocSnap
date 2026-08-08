import { useCallback, useEffect, useRef, useState } from "react";
import type { FilterType } from "../imageFilters";
import { generateThumbnail } from "../thumbnail";
import type { Redaction } from "../components/RedactionTool";

export interface PageEntry {
  processed: string | null;
  original: string;
  filter: FilterType;
  /** Low-res thumbnail (max 48px height) for fast page strip rendering */
  thumbnail: string;
  redactions?: Redaction[];
}

interface DragState {
  index: number;
  startX: number;
  deltaX: number;
  overIndex: number;
}

export const SLOT_WIDTH = 56; // 48px thumbnail + 8px gap

/**
 * Get the best thumbnail source for a page entry, preferring the thumbnail
 * but falling back to a reasonable alternative.
 */
export function getPageThumbSrc(page: PageEntry): string {
  if (page.thumbnail) return page.thumbnail;
  return page.filter === "color"
    ? page.original
    : (page.processed || page.original);
}

export function usePages() {
  const [pages, setPages] = useState<PageEntry[]>([]);
  const prevPagesLength = useRef(0);
  const [newPageIndices, setNewPageIndices] = useState<number[]>([]);

  const dragRef = useRef<DragState | null>(null);
  const [, setDragTick] = useState(0);
  const rerenderDrag = useCallback(() => setDragTick((t) => t + 1), []);

  // Track new page additions for slide-in animation
  useEffect(() => {
    if (pages.length > prevPagesLength.current) {
      const indices: number[] = [];
      for (let i = prevPagesLength.current; i < pages.length; i++) {
        indices.push(i);
      }
      setNewPageIndices(indices);
      const timer = setTimeout(() => setNewPageIndices([]), 400);
      prevPagesLength.current = pages.length;
      return () => clearTimeout(timer);
    }
    prevPagesLength.current = pages.length;
  }, [pages.length]);

  const addPage = useCallback((entry: PageEntry) => {
    // Generate thumbnail asynchronously if one isn't already set
    if (!entry.thumbnail) {
      const src = entry.filter === "color"
        ? entry.original
        : (entry.processed || entry.original);
      generateThumbnail(src).then((thumb) => {
        setPages((prev) =>
          prev.map((p) =>
            p.original === entry.original && p.filter === entry.filter && !p.thumbnail
              ? { ...p, thumbnail: thumb }
              : p
          )
        );
      }).catch(() => {});
    }
    // Store with placeholder thumbnail initially; async update replaces it
    setPages((prev) => [
      ...prev,
      { ...entry, thumbnail: entry.thumbnail || entry.processed || entry.original },
    ]);
  }, []);

  const addPages = useCallback((entries: PageEntry[]) => {
    // Generate thumbnails for all new entries asynchronously
    for (const entry of entries) {
      if (!entry.thumbnail) {
        const src = entry.filter === "color"
          ? entry.original
          : (entry.processed || entry.original);
        generateThumbnail(src).then((thumb) => {
          setPages((prev) =>
            prev.map((p) =>
              p.original === entry.original && p.filter === entry.filter && !p.thumbnail
                ? { ...p, thumbnail: thumb }
                : p
            )
          );
        }).catch(() => {});
      }
    }
    setPages((prev) => [
      ...prev,
      ...entries.map((e) => ({
        ...e,
        thumbnail: e.thumbnail || e.processed || e.original,
      })),
    ]);
  }, []);

  const deletePage = useCallback((index: number) => {
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

  const resetPages = useCallback(() => {
    setPages([]);
    setNewPageIndices([]);
    dragRef.current = null;
    prevPagesLength.current = 0;
  }, []);

  // --- Drag-and-drop pointer handlers ---

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

  return {
    pages,
    setPages,
    addPage,
    addPages,
    deletePage,
    movePage,
    resetPages,
    newPageIndices,
    dragRef,
    rerenderDrag,
    SLOT_WIDTH,
    handleDragPointerDown,
    handleDragPointerMove,
    handleDragPointerUp,
    handleDragPointerCancel,
  };
}
