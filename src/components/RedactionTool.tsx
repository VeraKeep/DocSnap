import { useEffect, useRef, useState } from "react";
export interface Redaction { x: number; y: number; width: number; height: number }
interface Props { imageUrl: string; redactions: Redaction[]; onChange: (r: Redaction[]) => void; onApply: () => void; onCancel: () => void }
/** Pointer canvas editor; coordinates are always in the image's natural pixel space. */
export function RedactionTool({ imageUrl, redactions, onChange, onApply, onCancel }: Props) {
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
  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex-1 overflow-auto p-3 flex items-center justify-center">
        <canvas ref={ref} className="max-h-full max-w-full touch-none object-contain" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-gray-800 p-3">
        <span className="text-xs text-gray-400">{redactions.length} redaction{redactions.length === 1 ? "" : "s"} · Draw over sensitive information</span>
        <div className="flex gap-2">
          <button onClick={() => onChange(redactions.slice(0, -1))} disabled={!redactions.length} className="rounded-lg border border-gray-700 px-3 py-2 text-sm disabled:opacity-40">Undo</button>
          <button onClick={() => onChange([])} disabled={!redactions.length} className="rounded-lg border border-gray-700 px-3 py-2 text-sm disabled:opacity-40">Clear</button>
          <button onClick={onCancel} className="rounded-lg border border-gray-600 px-3 py-2 text-sm">Cancel</button>
          <button onClick={onApply} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold">Apply Redactions</button>
        </div>
      </div>
    </div>
  );
}
