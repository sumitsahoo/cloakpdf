import { useEffect, useRef, useState } from "react";

/**
 * Tracks a container's rendered width relative to a page dimension,
 * returning a scale factor suitable for sizing overlay elements.
 */
export function usePreviewScale(pageDim: { width: number; height: number } | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pageDim) return;
    const update = () => {
      setScale(el.getBoundingClientRect().width / pageDim.width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageDim]);

  return [scale, ref] as const;
}
