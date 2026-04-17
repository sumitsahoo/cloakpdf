/**
 * Responsive grid container for page thumbnails.
 *
 * Centralises the repeated `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3`
 * markup that appears across tools that render a full-page thumbnail
 * picker (Delete, Extract, RemoveBlank, PdfToImage, RedactPdf, etc.).
 *
 * Intentionally minimal — tools render their own `<PageThumbnail>` (or
 * custom) children inside.
 */
interface ThumbnailGridProps {
  children: React.ReactNode;
  /** Additional classes appended to the default grid. */
  className?: string;
}

export function ThumbnailGrid({ children, className }: ThumbnailGridProps) {
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
