/**
 * useSortableDrag — shared hook for page-reordering drag interactions.
 *
 * Supports both the HTML5 drag API (desktop) and touch events (mobile).
 *
 * Components must:
 *  1. Spread `getItemProps(slot)` onto every draggable item — this wires up
 *     both the HTML5 drag API and touch handlers in one call.
 *  2. Add `data-drop-slot={slot}` to every drop-zone div so touch tracking
 *     can identify the target slot via `document.elementFromPoint`.
 *     (If using `SortableGrid`, drop-zones are handled automatically.)
 *
 * Touch behaviour:
 *  - Drag activates after an 8 px movement threshold so short taps still
 *    fire onClick (important for DuplicatePage).
 *  - Once active, `touchmove` calls `preventDefault()` to stop the page
 *    from scrolling — this requires the listener to be non-passive, which
 *    is why it is registered on `document` rather than via JSX props.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export function useSortableDrag(onMove: (fromIndex: number, toSlot: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  /** Current touch position — non-null only during an active touch drag. */
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);

  // Refs so the document-level listeners don't need to be re-registered
  const touchStartSlot = useRef<number | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragActive = useRef(false);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  /** Touch handlers for a single draggable item (used internally by getItemProps). */
  const getTouchHandlers = useCallback(
    (slot: number) => ({
      onTouchStart(e: React.TouchEvent) {
        touchStartSlot.current = slot;
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        isDragActive.current = false;
      },
      // Prevent iOS long-press callout / page preview from hijacking drag.
      style: {
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      } as React.CSSProperties,
    }),
    [],
  );

  /**
   * All props needed to make an element draggable (HTML5 + touch).
   * Spread the result onto the draggable element:  `{...getItemProps(slot)}`
   */
  const getItemProps = useCallback(
    (slot: number) => ({
      draggable: true as const,
      onDragStart(e: React.DragEvent) {
        e.dataTransfer.effectAllowed = "move";
        setDragIndex(slot);
      },
      onDragEnd() {
        setDragIndex(null);
        setDragOverSlot(null);
      },
      ...getTouchHandlers(slot),
    }),
    [getTouchHandlers],
  );

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartSlot.current === null || touchStartPos.current === null) return;

      const touch = e.touches[0];

      // Activate drag only after the finger has moved at least 8 px.
      if (!isDragActive.current) {
        const dx = touch.clientX - touchStartPos.current.x;
        const dy = touch.clientY - touchStartPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 8) return;
        isDragActive.current = true;
        setDragIndex(touchStartSlot.current);
      }

      // Prevent page scroll while reordering.
      e.preventDefault();

      // Track finger position for the drag overlay.
      setTouchPos({ x: touch.clientX, y: touch.clientY });

      // Find which drop-zone slot is under the finger.
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const zone = el?.closest("[data-drop-slot]") as HTMLElement | null;
      if (zone) {
        const slot = parseInt(zone.dataset.dropSlot!, 10);
        const from = touchStartSlot.current!;
        const isAdjacent = slot === from || slot === from + 1;
        setDragOverSlot(isAdjacent ? null : slot);
      } else {
        setDragOverSlot(null);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isDragActive.current && touchStartSlot.current !== null) {
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const zone = el?.closest("[data-drop-slot]") as HTMLElement | null;
        if (zone) {
          const slot = parseInt(zone.dataset.dropSlot!, 10);
          const from = touchStartSlot.current;
          const isAdjacent = slot === from || slot === from + 1;
          if (!isAdjacent) {
            onMoveRef.current(from, slot);
          }
        }
      }
      isDragActive.current = false;
      touchStartSlot.current = null;
      touchStartPos.current = null;
      setDragIndex(null);
      setDragOverSlot(null);
      setTouchPos(null);
    };

    const handleTouchCancel = () => {
      isDragActive.current = false;
      touchStartSlot.current = null;
      touchStartPos.current = null;
      setDragIndex(null);
      setDragOverSlot(null);
      setTouchPos(null);
    };

    // Non-passive so we can call preventDefault() during active drag.
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchCancel);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, []); // all mutable state accessed via refs — no deps needed

  return {
    dragIndex,
    dragOverSlot,
    touchPos,
    setDragIndex,
    setDragOverSlot,
    getItemProps,
    getTouchHandlers,
  };
}

/** Convenience type for passing the full drag bag to SortableGrid. */
export type SortableDrag = ReturnType<typeof useSortableDrag>;
