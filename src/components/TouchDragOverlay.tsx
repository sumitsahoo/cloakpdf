/**
 * TouchDragOverlay — floating preview that follows the finger during touch drag.
 *
 * On desktop, the HTML5 Drag API provides a built-in ghost image. On mobile,
 * touch events have no equivalent, so this component renders a small
 * semi-transparent thumbnail at the current touch position via a portal.
 */

import { createPortal } from "react-dom";

interface TouchDragOverlayProps {
  /** Current touch coordinates (null when not dragging via touch). */
  touchPos: { x: number; y: number } | null;
  children: React.ReactNode;
}

export function TouchDragOverlay({ touchPos, children }: TouchDragOverlayProps) {
  if (!touchPos) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: touchPos.x,
        top: touchPos.y,
        transform: "translate(-50%, -60%) rotate(-3deg)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
      className="opacity-80 scale-90 shadow-xl rounded-lg"
    >
      {children}
    </div>,
    document.body,
  );
}
