/**
 * SortableGrid — reusable drag-and-drop grid for page reordering.
 *
 * Renders an interleaved layout of drop-zones and items:
 *   [drop_0] [item_0] [drop_1] [item_1] ... [item_N-1] [drop_N]
 *
 * Drop-zones expand when hovering during a drag to show where the item will
 * land. A floating TouchDragOverlay follows the finger on mobile.
 *
 * Usage:
 *   const drag = useSortableDrag(handleMove);
 *
 *   <SortableGrid
 *     itemCount={items.length}
 *     drag={drag}
 *     onMove={handleMove}
 *     renderItem={(slot, isSource) => <PageCard ... />}
 *     renderOverlay={(dragIndex) => <OverlayContent ... />}
 *   />
 */

import type { SortableDrag } from "../hooks/useSortableDrag.ts";
import { TouchDragOverlay } from "./TouchDragOverlay.tsx";

interface SortableGridProps {
  /** Total number of items in the list. */
  itemCount: number;
  /** Drag state bag from useSortableDrag. */
  drag: SortableDrag;
  /** Called when an item is dropped at a new slot (desktop HTML5 drag path). */
  onMove: (fromIndex: number, toSlot: number) => void;
  /**
   * Render a single item at the given slot.
   * The item is responsible for spreading `drag.getItemProps(slot)` (or a
   * subset of it) onto its root element to make it draggable.
   */
  renderItem: (slot: number, isSource: boolean) => React.ReactNode;
  /** Render the content shown inside the floating touch-drag overlay. */
  renderOverlay?: (dragIndex: number) => React.ReactNode;
  /** Optional class override for the grid wrapper. */
  className?: string;
}

export function SortableGrid({
  itemCount,
  drag,
  onMove,
  renderItem,
  renderOverlay,
  className,
}: SortableGridProps) {
  const { dragIndex, dragOverSlot, touchPos, setDragIndex, setDragOverSlot } = drag;
  const isDragging = dragIndex !== null;

  const elements: React.ReactNode[] = [];

  for (let slot = 0; slot <= itemCount; slot++) {
    const isAdjacentToDrag = dragIndex !== null && (slot === dragIndex || slot === dragIndex + 1);

    // ── Drop zone ──
    elements.push(
      <div
        key={`drop-${slot}`}
        data-drop-slot={slot}
        onDragOver={(e) => {
          if (isAdjacentToDrag) return;
          e.preventDefault();
          setDragOverSlot(slot);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (dragOverSlot === slot) setDragOverSlot(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragIndex === null || isAdjacentToDrag) return;
          onMove(dragIndex, slot);
          setDragIndex(null);
          setDragOverSlot(null);
        }}
        className={`self-stretch flex items-center justify-center rounded-lg transition-all duration-200 ${
          isDragging && !isAdjacentToDrag
            ? dragOverSlot === slot
              ? "w-20 sm:w-24 bg-primary-50 dark:bg-primary-900/20"
              : "w-3 sm:w-4"
            : "w-0"
        }`}
      >
        {isDragging && !isAdjacentToDrag && (
          <div
            className={`rounded-full transition-all duration-200 ${
              dragOverSlot === slot
                ? "w-1 bg-primary-500"
                : "w-0.5 bg-primary-200 dark:bg-primary-800"
            }`}
            style={{ height: dragOverSlot === slot ? "80%" : "60%" }}
          />
        )}
      </div>,
    );

    // ── Item ──
    if (slot < itemCount) {
      elements.push(renderItem(slot, dragIndex === slot));
    }
  }

  return (
    <>
      <div
        className={className ?? "flex flex-wrap items-end gap-y-6 overflow-x-auto pb-2 min-h-28"}
      >
        {elements}
      </div>

      {dragIndex !== null && touchPos !== null && renderOverlay && (
        <TouchDragOverlay touchPos={touchPos}>{renderOverlay(dragIndex)}</TouchDragOverlay>
      )}
    </>
  );
}
