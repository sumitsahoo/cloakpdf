interface PageThumbnailProps {
  src: string;
  pageNumber: number;
  selected?: boolean;
  rotation?: number;
  onClick?: () => void;
  overlay?: React.ReactNode;
}

export function PageThumbnail({
  src,
  pageNumber,
  selected = false,
  rotation = 0,
  onClick,
  overlay,
}: PageThumbnailProps) {
  return (
    <div
      onClick={onClick}
      className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-200"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="aspect-[3/4] bg-white flex items-center justify-center overflow-hidden">
        <img
          src={src}
          alt={`Page ${pageNumber}`}
          className="max-w-full max-h-full object-contain transition-transform"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5">
        <span className="text-xs text-white font-medium">Page {pageNumber}</span>
      </div>
      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>
      )}
    </div>
  );
}
