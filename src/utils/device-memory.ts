/**
 * Form-factor heuristic used by the tool registry to gate features
 * that don't run on mobile (currently just the Ask PDF on-device AI
 * tool, see `tool.desktopOnly` in `src/config/tool-registry.ts`).
 *
 * **We do not detect RAM here.** Earlier revisions of this file
 * exported `getDeviceMemoryGb`, `assessMemoryFit`, and
 * `formatDeviceMemory` wrappers around `navigator.deviceMemory`.
 * Those were removed because the signal is too unreliable to use as
 * a recommendation input:
 *
 *   - Chrome caps `navigator.deviceMemory` at 8 GB for fingerprinting
 *     privacy, so a 16 GB or 32 GB desktop reads identical to an 8 GB
 *     laptop.
 *   - Firefox and Safari don't expose the API at all.
 *
 * The on-device AI UI now states memory requirements plainly
 * ("recommended ≥ 16 GB") and trusts the user to know their machine,
 * rather than pretending to diagnose it for them. The filename is
 * kept (rather than renamed) so the desktopOnly gating import stays
 * stable.
 */

/** `true` for phones/tablets where memory pressure is generally tighter. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
