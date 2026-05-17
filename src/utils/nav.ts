/**
 * Cross-component tool navigation.
 *
 * App.tsx owns the active-view state and routes purely via React state
 * (no URL hash). Tools deep inside the tree can't `setView` directly,
 * so they fire a `CustomEvent` and App subscribes. Keeps the routing
 * surface tiny — one event, one listener — without dragging a context
 * provider through the entire tree for a once-per-feature deep-link.
 *
 * Current use site: the encrypted-PDF notice surfaced by `usePdfFile`
 * deep-links into the PDF Password tool so users can unlock the file
 * and come back.
 */
import type { ToolId } from "../types.ts";

export const NAVIGATE_TOOL_EVENT = "cloakpdf:navigate-tool";

export function navigateToTool(toolId: ToolId): void {
  window.dispatchEvent(new CustomEvent<ToolId>(NAVIGATE_TOOL_EVENT, { detail: toolId }));
}
