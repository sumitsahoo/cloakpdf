/**
 * Device-memory and form-factor heuristics used by the AI tools to
 * recommend a model tier the user's machine can actually run.
 *
 * Why this exists: a 1.5B-param chat model unpacks to ~2.5 GB of peak
 * RAM during inference once you add KV-cache and ONNX runtime overhead.
 * On a phone (or any tab with a strict per-process memory budget) that
 * either crashes the page or makes the OS swap aggressively. Detecting
 * approximate RAM lets us steer those users to the 0.5B tier *before*
 * they pay the 1.1 GB download.
 *
 * The detection is intentionally cheap and best-effort:
 *
 *   - `navigator.deviceMemory` is the W3C signal (Chrome / Edge / Opera).
 *     Returns RAM in GB, quantised to {0.25, 0.5, 1, 2, 4, 8} for privacy.
 *     Firefox and Safari don't ship it, so we treat `undefined` as "no
 *     signal" rather than "no memory".
 *   - Mobile detection is a UA-string check. Imperfect but enough to
 *     refuse the big model when we have no `deviceMemory` reading.
 */

/** Approximate device RAM in GB, or `null` when the browser doesn't expose it. */
export function getDeviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === "number" ? mem : null;
}

/** `true` for phones/tablets where memory pressure is generally tighter. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Result of a memory-vs-model fit check.
 *
 *   - `fit: "ok"`      — peak RAM comfortably below the device's budget.
 *   - `fit: "tight"`   — workable but close to the limit; warn the user.
 *   - `fit: "risky"`   — likely to OOM; nudge them to a smaller tier.
 *   - `fit: "unknown"` — no signal (Firefox/Safari without `deviceMemory`);
 *     callers should not block on this — show a generic "may use a lot
 *     of RAM" hint instead.
 */
export type MemoryFit = "ok" | "tight" | "risky" | "unknown";

/**
 * Compare a model's expected peak RAM against the device's available
 * RAM and return a coarse fit verdict. The thresholds are deliberately
 * conservative because the browser only gets ~half of physical RAM on
 * mobile and even less when other tabs are open.
 */
export function assessMemoryFit(modelPeakRamBytes: number): MemoryFit {
  const gb = getDeviceMemoryGb();
  const peakGb = modelPeakRamBytes / (1024 * 1024 * 1024);

  if (gb === null) {
    // No reading available. Use mobile as a coarse proxy for "tight
    // budget" — desktop browsers without `deviceMemory` (Firefox,
    // Safari on Mac) are almost always fine for these models.
    if (isMobileDevice() && peakGb > 1.5) return "risky";
    return "unknown";
  }

  // Browser typically gets ~40-60% of physical RAM on mobile, more on
  // desktop. We use 50% as a workable midpoint.
  const budgetGb = gb * 0.5;
  if (peakGb > budgetGb) return "risky";
  if (peakGb > budgetGb * 0.7) return "tight";
  return "ok";
}

/** Format the device-memory reading for display, e.g. "4 GB" or "—". */
export function formatDeviceMemory(): string {
  const gb = getDeviceMemoryGb();
  if (gb === null) return "unknown";
  // `deviceMemory` is already quantised, so a single decimal is enough.
  return gb >= 1 ? `${gb} GB` : `${Math.round(gb * 1000)} MB`;
}
