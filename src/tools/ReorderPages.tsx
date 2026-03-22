import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { reorderPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

interface SortablePageProps {
  id: string;
  src: string;
  pageNumber: number;
}

function SortablePage({ id, src, pageNumber }: SortablePageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <div className="relative group rounded-lg overflow-hidden border-2 border-slate-200 hover:border-indigo-300 transition-colors">
        <div className="aspect-[3/4] bg-white flex items-center justify-center overflow-hidden">
          <img
            src={src}
            alt={`Page ${pageNumber}`}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5">
          <span className="text-xs text-white font-medium">Page {pageNumber}</span>
        </div>
        <div className="absolute top-1 right-1 bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
          {pageNumber}
        </div>
      </div>
    </div>
  );
}

export default function ReorderPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setOrder(thumbs.map((_, i) => String(i)));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const next = [...prev];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, String(active.id));
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const newOrder = order.map(Number);
      const result = await reorderPages(file, newOrder);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_reordered.pdf`);
    } finally {
      setProcessing(false);
    }
  }, [file, order]);

  const isReordered = order.some((id, i) => Number(id) !== i);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Drag and drop pages to reorder them"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setOrder([]);
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {order.map((id) => {
                    const originalIndex = Number(id);
                    return (
                      <SortablePage
                        key={id}
                        id={id}
                        src={thumbnails[originalIndex]}
                        pageNumber={originalIndex + 1}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {isReordered && (
            <button
              onClick={handleApply}
              disabled={processing}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Reordering..." : "Apply New Order & Download"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
