/**
 * Single source of truth for which tools can participate in a workflow.
 *
 * A tool is eligible when it accepts a single PDF as input and produces
 * a single PDF as output, AND its component has been migrated to use
 * `useToolOutput` (so the runner can intercept its result).
 *
 * Tools that are explicitly NOT eligible — and why:
 *
 *  - `merge`, `images-to-pdf`     — multi-file or non-PDF input shape
 *  - `compare-pdf`                — needs a second PDF; not a chain step
 *  - `pdf-inspector`              — read-only; produces no PDF
 *  - `pdf-to-image`, `extract-images`, `contact-sheet` — terminal /
 *    non-PDF output (image / ZIP)
 *  - `digital-signature`, `pdf-password` — would require persisting
 *    cert / password in localStorage; deferred for security
 *
 * The phase-1 migration enables five tools that exercise the runner's
 * happy path AND its "skip if no-op" branch (remove-blank-pages).
 * Additional tools become eligible by (a) migrating their
 * `downloadPdf` call to `useToolOutput.deliver` and (b) adding their
 * id to the array below.
 */

import type { ToolId } from "../types.ts";

const ELIGIBLE_TOOL_IDS: ReadonlyArray<ToolId> = [
  "compress",
  "reverse-pages",
  "flatten",
  "grayscale",
  "remove-blank-pages",
];

const ELIGIBLE_SET: ReadonlySet<string> = new Set(ELIGIBLE_TOOL_IDS);

/** True if the given tool id can be added as a workflow step. */
export function isWorkflowEligible(id: string): boolean {
  return ELIGIBLE_SET.has(id);
}

/** Eligible tool ids, in declaration order. */
export function eligibleToolIds(): ReadonlyArray<ToolId> {
  return ELIGIBLE_TOOL_IDS;
}
