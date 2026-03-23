/**
 * Canvas-based signature drawing pad.
 *
 * Captures mouse and touch input to draw freehand strokes on an HTML5 canvas.
 * The canvas is initialised with a white background so the exported PNG has
 * an opaque backdrop. When the user lifts the pen/finger, the current canvas
 * content is exported as a PNG data-URL via `onSignature`. A "Clear" button
 * lets the user reset the canvas.
 *
 * Coordinate scaling (`scaleX/scaleY`) is applied so strokes stay accurate
 * even when the canvas is CSS-resized to fill its container.
 */

import { useRef, useEffect, useState, useCallback } from "react";

interface SignaturePadProps {
  /** Called with the PNG data-URL every time the user finishes a stroke. Empty string on clear. */
  onSignature: (dataUrl: string) => void;
  /** Intrinsic canvas width in pixels (default 500). */
  width?: number;
  /** Intrinsic canvas height in pixels (default 200). */
  height?: number;
}

export function SignaturePad({ onSignature, width = 500, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

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
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setIsDrawing(true);
      setHasContent(true);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    },
    [isDrawing, getPos],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
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
    setHasContent(false);
    onSignature("");
  }, [onSignature]);

  return (
    <div className="space-y-2">
      <div className="border border-slate-300 dark:border-dark-border rounded-lg overflow-hidden bg-white dark:bg-dark-surface">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 dark:text-dark-text-muted">
          Draw your signature above
        </p>
        {hasContent && (
          <button
            onClick={clear}
            className="text-xs text-slate-500 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
