/**
 * React context that lets a tool component participate in a workflow
 * without knowing anything about the workflow runner.
 *
 * When non-null, a tool is currently being inflated as one step of a
 * running workflow. The two primitives `usePdfFile` and `useToolOutput`
 * read this context to:
 *
 *   1. Skip the file dropzone and seed `file` with `injectedFile`.
 *   2. Replace the local `downloadPdf(...)` call with `onComplete(...)`,
 *      which advances the runner to the next step.
 *
 * Tools render exactly the same JSX in both modes — the difference is
 * confined to the two hooks. This is the seam that lets us reuse every
 * existing tool UI as-is in workflows.
 */

import { createContext, useContext } from "react";

export interface WorkflowSlot {
  /** PDF coming from the previous step (or the user's initial upload). */
  injectedFile: File;
  /**
   * Called when the tool produces its result. The runner uses `bytes`
   * as the input for the next step, and `suggestedSuffix` to label the
   * intermediate file ("_compressed", "_flattened", …) so a final
   * download has a meaningful name.
   */
  onComplete: (bytes: Uint8Array, suggestedSuffix: string) => void;
  /**
   * Called when a step decides it has nothing to do (e.g. blank-page
   * detection found zero matches). The runner skips to the next step
   * and surfaces `reason` as a brief notice.
   */
  onSkip: (reason: string) => void;
  /** True if this is the last step — affects the action button label. */
  isLastStep: boolean;
}

export const WorkflowContext = createContext<WorkflowSlot | null>(null);

/** Returns the current workflow slot, or `null` if rendered standalone. */
export function useWorkflowSlot(): WorkflowSlot | null {
  return useContext(WorkflowContext);
}
