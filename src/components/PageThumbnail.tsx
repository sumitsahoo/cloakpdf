/**
 * Card displaying a rendered PDF page thumbnail.
 *
 * Shows the page image inside a 3:4 aspect-ratio container with a page
 * number badge. Supports optional rotation (CSS transform), a selected
 * state with a highlighted border, and a custom overlay (e.g. a delete icon).
 */

interface PageThumbnailProps {
  /** Data-URL (PNG) of the rendered page. */
  src: string;
  /** 1-based page number shown in the badge. */
  pageNumber: number;
  /** Whether this page is currently selected. */
  selected?: boolean;
  /** CSS rotation angle in degrees applied to the thumbnail image. */
  rotation?: number;
  /** Click handler for selecting/toggling the page. */
  onClick?: () => void;
  /** Optional overlay element rendered on top of the thumbnail (e.g. delete icon). */
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
          ? "border-primary-500 ring-2 ring-primary-200"
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
