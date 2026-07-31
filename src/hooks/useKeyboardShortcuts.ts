import { useEffect, useRef } from "react";

/**
 * Detect whether the user is likely on a desktop (non-mobile) device.
 * Checks for: pointer coarse (touch), no orientation API, screen width.
 */
export function useIsDesktop(): boolean {
  // Check multiple signals — if any says "mobile", assume not desktop
  if (typeof window === "undefined") return false;

  // Coarse pointer → touch device → mobile
  if (window.matchMedia?.("(pointer: coarse)").matches) return false;

  // Very narrow screen → likely mobile
  if (window.innerWidth < 768) return false;

  // Has orientation API with angle → typical mobile
  if ("orientation" in window.screen && typeof (window.screen as any).orientation?.angle === "number") {
    return false;
  }

  return true;
}

export interface ShortcutMap {
  capture?: () => void;
  closeCamera?: () => void;
  retake?: () => void;
  done?: () => void;
  filterSwitch?: (index: number) => void;
}

/**
 * Register keyboard shortcuts. Only active when isDesktop is true.
 * Shortcuts:
 *   Space / Enter = capture (only when camera is active)
 *   Escape = close camera / go back to idle
 *   R = retake current capture
 *   D / Ctrl+Enter = done / download PDF
 *   1-6 = switch filters
 */
export function useKeyboardShortcuts(
  isDesktop: boolean,
  shortcuts: ShortcutMap,
) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!isDesktop) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const s = shortcutsRef.current;

      switch (e.key) {
        case " ":
        case "Spacebar": // Older browsers
          if (s.capture) {
            e.preventDefault();
            s.capture();
          }
          break;
        case "Enter":
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Enter / Cmd+Enter = done
            if (s.done) {
              e.preventDefault();
              s.done();
            }
          } else if (s.capture) {
            e.preventDefault();
            s.capture();
          }
          break;
        case "Escape":
          if (s.closeCamera) {
            e.preventDefault();
            s.closeCamera();
          }
          break;
        case "r":
        case "R":
          if (s.retake) {
            e.preventDefault();
            s.retake();
          }
          break;
        case "d":
        case "D":
          if (!e.ctrlKey && !e.metaKey && s.done) {
            e.preventDefault();
            s.done();
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
          if (s.filterSwitch && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            s.filterSwitch(parseInt(e.key) - 1);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop]);
}
