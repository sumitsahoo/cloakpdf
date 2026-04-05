/**
 * Canvas-based signature drawing pad.
 *
 * Captures mouse and touch input to draw freehand strokes on an HTML5 canvas.
 * Stroke paths are stored so the entire signature can be replayed in a new
 * colour when the user picks a different ink. When the user lifts the
 * pen/finger, the current canvas content is exported as a PNG data-URL via
 * `onSignature`. A "Clear" button lets the user reset the canvas.
 *
 * Coordinate scaling (`scaleX/scaleY`) is applied so strokes stay accurate
 * even when the canvas is CSS-resized to fill its container.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";

interface SignaturePadProps {
  /** Called with the PNG data-URL every time the user finishes a stroke. Empty string on clear. */
  onSignature: (dataUrl: string) => void;
  /** Hex colour string for the stroke ink (e.g. "#1e293b"). */
  color: string;
  /** Intrinsic canvas width in pixels (default 500). */
  width?: number;
  /** Intrinsic canvas height in pixels (default 200). */
  height?: number;
}

type Point = { x: number; y: number };

/** Draws a stroke as a smooth quadratic Bézier curve using the midpoint technique. */
function drawSmooth(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 2) {
    // Single tap — draw a small filled circle
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    // Control point = points[i], end point = midpoint between points[i] and points[i+1]
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  // Draw to the final point
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export function SignaturePad({ onSignature, color, width = 500, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  // Tracks the last drawn midpoint so each frame only adds one smooth segment
  const lastMidRef = useRef<Point | null>(null);

  /** Replay all stored strokes onto the canvas in the given colour. */
  const replayStrokes = useCallback((strokeColor: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      drawSmooth(ctx, stroke);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // When colour changes, replay all existing strokes in the new colour and re-export
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (strokesRef.current.length > 0) {
      replayStrokes(color);
      onSignature(canvasRef.current!.toDataURL("image/png"));
    } else {
      ctx.strokeStyle = color;
    }
  }, [color, replayStrokes, onSignature]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      // Always sync the current color before a new stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pos = getPos(e);
      currentStrokeRef.current = [pos];
      lastMidRef.current = pos;
      setIsDrawing(true);
      setHasContent(true);
    },
    [getPos, color],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      const prev = currentStrokeRef.current[currentStrokeRef.current.length - 1];
      currentStrokeRef.current.push(pos);

      // Draw one smooth quadratic segment from the last midpoint to the new midpoint,
      // using the previous raw point as the Bézier control point.
      const mid = { x: (prev.x + pos.x) / 2, y: (prev.y + pos.y) / 2 };
      ctx.beginPath();
      const from = lastMidRef.current ?? prev;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      ctx.stroke();
      lastMidRef.current = mid;
    },
    [isDrawing, getPos],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current]);
      currentStrokeRef.current = [];
    }
    const canvas = canvasRef.current;
    if (canvas) {
      onSignature(canvas.toDataURL("image/png"));
    }
  }, [isDrawing, onSignature]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setHasContent(false);
    onSignature("");
  }, [onSignature]);

  return (
    <div className="space-y-1.5">
      <div
        className={`relative border rounded-xl overflow-hidden bg-white dark:bg-dark-surface motion-safe:transition-[border-color,box-shadow] duration-200 ${
          isDrawing
            ? "border-primary-400 dark:border-primary-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
            : "border-slate-300 dark:border-dark-border hover:border-slate-400 dark:hover:border-slate-600"
        }`}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label="Signature drawing area — draw with mouse or touch"
          className="w-full cursor-crosshair touch-none block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {/* Empty-state hint — hidden once drawing starts */}
        {!hasContent && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-7 gap-2 select-none">
            <p className="text-sm text-slate-300 dark:text-slate-600 font-medium tracking-wide">
              Sign here
            </p>
            <div className="w-2/3 border-b border-dashed border-slate-200 dark:border-slate-700" />
          </div>
        )}
      </div>

      {hasContent && (
        <div className="flex justify-end">
          <button
            onClick={clear}
            aria-label="Clear signature"
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-text-muted hover:text-red-500 dark:hover:text-red-400 motion-safe:transition-colors duration-150 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
