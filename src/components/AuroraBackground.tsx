/**
 * Aurora — six animated, blurred liquid-drop blobs that drift across the
 * viewport. Self-contained: drop it inside any container — the blobs
 * paint at z-index: 0 in the parent's stacking context, so any sibling
 * content with explicit z-index >= 1 (or that comes after this in the
 * tree, with no z) renders above them.
 *
 * Defaults match the CloakResume onboarding palette and a `multiply`
 * blend (good against a light background). Override via props for
 * other tools / dark surfaces.
 *
 * Honors prefers-reduced-motion. On narrow screens the two smallest
 * blobs drop out and the blur radius shrinks — fullscreen blur is the
 * single most expensive paint operation on mobile GPUs, so this keeps
 * scrolling smooth without changing the silhouette story noticeably.
 */

import type { CSSProperties } from "react";

type BlendMode =
  | "multiply"
  | "screen"
  | "overlay"
  | "lighten"
  | "darken"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn"
  | "normal";

const DEFAULT_COLORS: readonly [string, string, string, string, string, string] = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#059669",
];

interface Props {
  /** Six blob fills. Defaults to the CloakResume palette. */
  colors?: readonly [string, string, string, string, string, string];
  /**
   * `mix-blend-mode` for the blobs. `multiply` tints a light backdrop
   * with the blob hue; `screen` glows against a dark backdrop. Leave
   * undefined to inherit `--aurora-blend` from the surrounding CSS
   * (defaults to `multiply` if no token is set).
   */
  blendMode?: BlendMode;
  /** Per-blob base opacity. The breathing animation oscillates ±30% around this. Defaults to 0.12. */
  opacity?: number;
  className?: string;
}

/* ────────────────────────────────────────────────────────────────
 * Blob configuration. Each entry drives a single `<div class="aurora-blob">`
 * via inline CSS custom properties (`--w`, `--bg`, `--morph`, `--flow`,
 * `--breathe-*`) plus direct `top/right/bottom/left` styles. The CSS
 * has a single generic `.aurora-blob` rule that consumes those vars —
 * no per-blob CSS rules.
 *
 * Sizes use clamp(min, vw, max) so blobs scale with the viewport while
 * staying readable on phones and bounded on desktop. `colorIndex` picks
 * from the `colors` prop. `hideMobile` opts a blob out of small screens
 * for the perf budget. Negative animation-delays decorrelate the loops
 * so the composite never visibly repeats.
 * ──────────────────────────────────────────────────────────────── */
interface BlobConfig {
  size: string;
  pos: { top?: string; right?: string; bottom?: string; left?: string };
  colorIndex: number;
  morph: string;
  flow: string;
  breatheDur: string;
  breatheDelay: string;
  hideMobile: boolean;
}

const BLOBS: readonly BlobConfig[] = [
  {
    size: "clamp(320px, 52vw, 720px)",
    pos: { top: "-8%", left: "-10%" },
    colorIndex: 0,
    morph: "aurora-morph-a 18s ease-in-out infinite",
    flow: "aurora-flow-a 50s linear infinite",
    breatheDur: "12s",
    breatheDelay: "-2s",
    hideMobile: false,
  },
  {
    size: "clamp(240px, 36vw, 520px)",
    pos: { top: "-5%", right: "-8%" },
    colorIndex: 1,
    morph: "aurora-morph-b 20s ease-in-out infinite -4s",
    flow: "aurora-flow-b 58s linear infinite -16s",
    breatheDur: "14s",
    breatheDelay: "-7s",
    hideMobile: false,
  },
  {
    size: "clamp(180px, 26vw, 380px)",
    pos: { top: "30%", left: "25%" },
    colorIndex: 2,
    morph: "aurora-morph-a 22s ease-in-out infinite -10s",
    flow: "aurora-flow-c 44s linear infinite -12s",
    breatheDur: "11s",
    breatheDelay: "-3s",
    hideMobile: true,
  },
  {
    size: "clamp(300px, 46vw, 660px)",
    pos: { bottom: "-10%", left: "-8%" },
    colorIndex: 3,
    morph: "aurora-morph-b 19s ease-in-out infinite -2s",
    flow: "aurora-flow-a 54s linear infinite -28s",
    breatheDur: "13s",
    breatheDelay: "-1s",
    hideMobile: false,
  },
  {
    size: "clamp(160px, 22vw, 320px)",
    pos: { bottom: "-6%", right: "-10%" },
    colorIndex: 4,
    morph: "aurora-morph-a 21s ease-in-out infinite -8s",
    flow: "aurora-flow-b 62s linear infinite -34s",
    breatheDur: "10s",
    breatheDelay: "-5s",
    hideMobile: true,
  },
  {
    size: "clamp(220px, 32vw, 460px)",
    pos: { top: "18%", right: "12%" },
    colorIndex: 5,
    morph: "aurora-morph-b 17s ease-in-out infinite -12s",
    flow: "aurora-flow-c 48s linear infinite -6s",
    breatheDur: "15s",
    breatheDelay: "-9s",
    hideMobile: false,
  },
];

/**
 * Stylesheet kept alongside the component so the effect ships as a
 * single file. Rendered as a `<style precedence>` tag — React 19
 * hoists it into `<head>` and dedupes by precedence key, so multiple
 * instances of `<AuroraBackground />` (or other importers) share one
 * stylesheet rather than spraying duplicates into the DOM.
 *
 * One generic `.aurora-blob` rule reads per-blob inline custom
 * properties; per-blob style rules don't exist. Keep static.
 */
const STYLESHEET = `
@keyframes aurora-morph-a {
  0%, 100% { border-radius: 70% 30% 50% 50% / 50% 60% 40% 50%; }
  20% { border-radius: 30% 70% 70% 30% / 70% 30% 70% 30%; }
  40% { border-radius: 50% 50% 20% 80% / 20% 80% 25% 75%; }
  60% { border-radius: 80% 20% 80% 20% / 65% 35% 70% 30%; }
  80% { border-radius: 25% 75% 35% 65% / 75% 25% 65% 35%; }
}
@keyframes aurora-morph-b {
  0%, 100% { border-radius: 40% 60% 70% 30% / 25% 75% 30% 70%; }
  25% { border-radius: 80% 20% 30% 70% / 50% 50% 80% 20%; }
  50% { border-radius: 25% 75% 75% 25% / 80% 20% 30% 70%; }
  75% { border-radius: 60% 40% 30% 70% / 35% 65% 80% 20%; }
}
@keyframes aurora-flow-a {
  0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
  25% { transform: translate(55vw, 30vh) rotate(80deg) scale(1.2); }
  50% { transform: translate(40vw, 65vh) rotate(180deg) scale(0.85); }
  75% { transform: translate(-15vw, 45vh) rotate(280deg) scale(1.1); }
}
@keyframes aurora-flow-b {
  0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
  33% { transform: translate(-50vw, 35vh) rotate(-110deg) scale(0.8); }
  66% { transform: translate(-25vw, 70vh) rotate(-220deg) scale(1.25); }
}
@keyframes aurora-flow-c {
  0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
  20% { transform: translate(30vw, -35vh) rotate(80deg) scale(1.3); }
  50% { transform: translate(60vw, 25vh) rotate(180deg) scale(0.85); }
  80% { transform: translate(-20vw, 55vh) rotate(290deg) scale(1.05); }
}
/* Subtle opacity pulse — each blob runs at its own period so the
   composite never lines up. The keyframes scale the base opacity
   (set via --aurora-opacity) so the prop still controls overall
   intensity. */
@keyframes aurora-breathe {
  0%, 100% { opacity: calc(var(--aurora-opacity, 0.12) * 0.7); }
  50%      { opacity: calc(var(--aurora-opacity, 0.12) * 1.3); }
}
.aurora-blob {
  position: fixed;
  pointer-events: none;
  /* z-index: 0 (rather than -1) so the component works whether or not
     the parent establishes a stacking context. Sibling content with
     explicit z-index >= 1 paints above; siblings with no z paint above
     by tree order (since the blobs render first in this component). */
  z-index: 0;
  width: var(--w);
  height: var(--w);
  background: var(--bg);
  filter: blur(60px);
  mix-blend-mode: var(--aurora-blend, multiply);
  opacity: var(--aurora-opacity, 0.12);
  will-change: border-radius, transform, opacity;
  animation:
    var(--morph),
    var(--flow),
    aurora-breathe var(--breathe-dur, 12s) ease-in-out infinite var(--breathe-delay, 0s);
}
/* Mobile budget: shrink the blur (the heaviest GPU op) and drop the
   two smallest blobs that mostly add density rather than silhouette.
   Aurora-root is fixed-positioned with overflow:hidden, and a vertical
   alpha mask fades the blobs to fully transparent across the URL-bar
   sample zone -- no blob colour reaches iOS Safari's bottom bar. The
   page-bg gradient (radials + cool slate base) is what the bar
   actually samples. */
@media (max-width: 640px) {
  .aurora-blob { filter: blur(36px); }
  .aurora-blob-mobile-hide { display: none; }
  .aurora-root {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    -webkit-mask-image: linear-gradient(
      to bottom,
      black 0,
      black calc(100% - 200px - env(safe-area-inset-bottom, 0px)),
      transparent calc(100% - 72px - env(safe-area-inset-bottom, 0px))
    );
    mask-image: linear-gradient(
      to bottom,
      black 0,
      black calc(100% - 200px - env(safe-area-inset-bottom, 0px)),
      transparent calc(100% - 72px - env(safe-area-inset-bottom, 0px))
    );
  }
  .aurora-blob {
    position: absolute;
  }
}
@media (prefers-reduced-motion: reduce) {
  .aurora-blob { animation: none; }
}
`;

export function AuroraBackground({
  colors = DEFAULT_COLORS,
  blendMode,
  opacity,
  className,
}: Props) {
  const rootStyle: CSSProperties = {
    ...(blendMode ? { "--aurora-blend": blendMode } : null),
    ...(opacity != null ? { "--aurora-opacity": String(opacity) } : null),
  } as CSSProperties;

  return (
    <div aria-hidden="true" className={`aurora-root ${className ?? ""}`} style={rootStyle}>
      <style precedence="aurora-background">{STYLESHEET}</style>
      {BLOBS.map((b) => {
        const blobStyle: CSSProperties = {
          ...b.pos,
          "--w": b.size,
          "--bg": colors[b.colorIndex],
          "--morph": b.morph,
          "--flow": b.flow,
          "--breathe-dur": b.breatheDur,
          "--breathe-delay": b.breatheDelay,
        } as CSSProperties;
        return (
          <div
            key={b.colorIndex}
            className={`aurora-blob${b.hideMobile ? " aurora-blob-mobile-hide" : ""}`}
            style={blobStyle}
          />
        );
      })}
    </div>
  );
}
