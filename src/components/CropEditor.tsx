import type { Quad, Point } from "../documentProcessor";

type CornerName = keyof Quad;

interface CropEditorProps {
  capturedImage: string;
  cropCorners: Quad;
  cropCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeCornerRef: React.MutableRefObject<CornerName | null>;
  onCornerUpdate: (corners: Quad) => void;
  onRetake: () => void;
  onApplyCrop: () => void;
}

/** Lightweight haptic feedback for mobile. */
function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // silently ignore
  }
}

export function CropEditor({
  capturedImage,
  cropCorners,
  cropCanvasRef,
  activeCornerRef,
  onCornerUpdate,
  onRetake,
  onApplyCrop,
}: CropEditorProps) {
  const updateCornerFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    const activeCorner = activeCornerRef.current;
    if (!canvas || !activeCorner) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    onCornerUpdate({
      ...cropCorners,
      [activeCorner]: {
        x: Math.max(0, Math.min(canvas.width - 1, x)),
        y: Math.max(0, Math.min(canvas.height - 1, y)),
      },
    });
  };

  const beginCornerDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
  };

  const endCornerDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    activeCornerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 animate-fade-in">
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

      <div className="flex items-center justify-center gap-3 bg-gray-950 px-4 py-5 safe-bottom">
        <button
          onClick={() => { vibrate(10); onRetake(); }}
          className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-300 transition active:scale-95"
        >
          Retake
        </button>
        <button
          onClick={() => { vibrate(10); onApplyCrop(); }}
          className="rounded-full bg-indigo-600 px-7 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-95"
        >
          Apply Crop
        </button>
      </div>
    </div>
  );
}
