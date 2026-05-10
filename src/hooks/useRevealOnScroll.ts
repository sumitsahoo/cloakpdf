/**
 * useRevealOnScroll — single-shot reveal once an element enters the viewport.
 *
 * Returns `{ ref, revealed }`. Attach `ref` to the target element and gate the
 * fade-in transform/opacity classes on `revealed`. Once true, it stays true and
 * the observer is disconnected — there's no re-trigger on scroll-out.
 *
 * Honours `prefers-reduced-motion` by considering elements revealed
 * immediately so dependent UI doesn't stay invisible.
 */

import { useEffect, useRef, useState } from "react";

interface RevealOptions {
  /** rootMargin passed to IntersectionObserver. Default trims 10% off the top. */
  rootMargin?: string;
  /** Visibility threshold. Default 0.1. */
  threshold?: number;
}

export function useRevealOnScroll<E extends HTMLElement = HTMLDivElement>({
  rootMargin = "0px 0px -10% 0px",
  threshold = 0.1,
}: RevealOptions = {}) {
  const ref = useRef<E>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(prefersReducedMotion);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [revealed, rootMargin, threshold]);

  return { ref, revealed };
}
