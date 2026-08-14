import { useEffect, useRef, useState } from "react";
export interface Redaction { x: number; y: number; width: number; height: number }

/** Result of an auto-detect ("Suggest") run, driven by the parent (Pro only). */
export interface SuggestResult {
  status: "idle" | "busy" | "ok" | "none" | "error";
  /** Human-readable outcome, e.g. "3 sensitive items found — added". */
  message: string;
  /** Number of redaction boxes actually added by the last successful run. */
  added: number;
}

/** Fraction of `a`'s area covered by its intersection with `b` (0–1). */
export function overlapRatio(a: Redaction, b: Redaction): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const area = a.width * a.height;
  if (area <= 0) return 0;
  return (w * h) / area;
}

/**
 * Append suggested boxes to the existing redaction list.
 * A suggestion is dropped when it overlaps any already-present box (user-drawn
 * or previously accepted) by ≥90% of its own area, so re-running auto-detect
 * never double-adds the same SSN. User boxes keep their order and are never removed.
 */
export function mergeRedactions(existing: Redaction[], suggested: Redaction[]): Redaction[] {
  const out = [...existing];
  for (const box of suggested) {
    const covered = out.some((r) => overlapRatio(box, r) >= 0.9);
    if (!covered) out.push(box);
  }
  return out;
}

interface Props {
  imageUrl: string;
  redactions: Redaction[];
  onChange: (r: Redaction[]) => void;
  onApply: () => void;
  onCancel: () => void;
  /** Show the Pro-only "Auto-detect" trigger (pass isPro). */
  suggestEnabled?: boolean;
  /** Latest auto-detect run state for the button + inline status line. */
  suggest?: SuggestResult;
  /** Runs OCR + sensitive detection; called when the user taps Auto-detect. */
  onSuggest?: () => void;
}

/** Pointer canvas editor; coordinates are always in the image's natural pixel space. */
export function RedactionTool({ imageUrl, redactions, onChange, onApply, onCancel, suggestEnabled = false, suggest = { status: "idle", message: "", added: 0 }, onSuggest }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [draft, setDraft] = useState<Redaction | null>(null);

  const draw = (extra: Redaction | null = null) => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const img = imageRef.current; if (!img) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    for (const r of redactions) { ctx.fillStyle = "#000"; ctx.fillRect(r.x, r.y, r.width, r.height); }
    if (extra) { ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.fillRect(extra.x, extra.y, extra.width, extra.height); }
  };

  // Load the base image once and size the canvas to the image's natural pixels.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      if (ref.current) { ref.current.width = img.naturalWidth; ref.current.height = img.naturalHeight; }
      draw(null);
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Repaint whenever committed redactions or the in-progress draft change,
  // so the box is visible live while the user drags.
  useEffect(() => { draw(); });

  const point = (e: React.PointerEvent) => {
    const c = ref.current!, b = c.getBoundingClientRect();
    return { x: (e.clientX - b.left) * c.width / b.width, y: (e.clientY - b.top) * c.height / b.height };
  };
  const down = (e: React.PointerEvent) => {
    const p = point(e); start.current = p;
    ref.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = point(e);
    setDraft({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), width: Math.abs(p.x - start.current.x), height: Math.abs(p.y - start.current.y) });
  };
  const up = (e: React.PointerEvent) => {
    if (draft && draft.width > 4 && draft.height > 4) onChange([...redactions, draft]);
    start.current = null; setDraft(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const busy = suggest.status === "busy";
  const statusColor = suggest.status === "error" ? "text-red-400" : suggest.status === "ok" ? "text-emerald-400" : "text-gray-400";
  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex-1 overflow-auto p-3 flex items-center justify-center">
        <canvas ref={ref} className="max-h-full max-w-full touch-none object-contain" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      <div className="flex flex-col gap-2 border-t border-gray-800 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-400">{redactions.length} redaction{redactions.length === 1 ? "" : "s"} · Draw over sensitive information</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {suggestEnabled && (
              <button onClick={onSuggest} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-950/40 px-3 py-2 text-sm text-indigo-200 transition hover:bg-indigo-900/40 disabled:opacity-60">
                {busy
                  ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
                  : <span aria-hidden>✨</span>}
                {busy ? "Scanning…" : "Auto-detect"}
                {suggest.status === "ok" && suggest.added > 0 && (
                  <span className="ml-0.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">+{suggest.added}</span>
                )}
              </button>
            )}
            <button onClick={() => onChange(redactions.slice(0, -1))} disabled={!redactions.length} className="rounded-lg border border-gray-700 px-3 py-2 text-sm disabled:opacity-40">Undo</button>
            <button onClick={() => onChange([])} disabled={!redactions.length} className="rounded-lg border border-gray-700 px-3 py-2 text-sm disabled:opacity-40">Clear</button>
            <button onClick={onCancel} className="rounded-lg border border-gray-600 px-3 py-2 text-sm">Cancel</button>
            <button onClick={onApply} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold">Apply Redactions</button>
          </div>
        </div>
        {suggest.status !== "idle" && (
          <p className={`text-xs ${statusColor}`}>{suggest.message}</p>
        )}
      </div>
    </div>
  );
}
