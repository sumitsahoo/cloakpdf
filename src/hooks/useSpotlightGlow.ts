/**
 * useSpotlightGlow — cursor/touch-tracking radial glow used by ToolCard,
 * WorkflowHeroCard, and FileDropZone. Spread `handlers` onto the target
 * element and render an absolutely-positioned div with `glowStyle` inside
 * it for the painted gradient.
 */

import { useCallback, useRef, useState } from "react";

interface SpotlightGlowOptions {
  /** Radial gradient color (e.g. "rgba(37,99,235,0.16)"). */
  color: string;
  /** Radial gradient radius in px. Defaults to 320. */
  radius?: number;
}

export function useSpotlightGlow<E extends HTMLElement = HTMLButtonElement>({
  color,
  radius = 320,
}: SpotlightGlowOptions) {
  const ref = useRef<E>(null);
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const setGlowAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setGlowStyle({
        opacity: 1,
        background: `radial-gradient(${radius}px circle at ${clientX - rect.left}px ${clientY - rect.top}px, ${color}, transparent 70%)`,
      });
    },
    [color, radius],
  );

  const clearGlow = useCallback(() => setGlowStyle({ opacity: 0 }), []);

  const handlers = {
    onMouseMove: (e: React.MouseEvent<E>) => setGlowAt(e.clientX, e.clientY),
    onMouseLeave: clearGlow,
    onTouchStart: (e: React.TouchEvent<E>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    onTouchMove: (e: React.TouchEvent<E>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    onTouchEnd: clearGlow,
    onTouchCancel: clearGlow,
  };

  return { ref, glowStyle, handlers };
}
