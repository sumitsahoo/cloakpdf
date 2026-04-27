/**
 * Tool-output hook — the single seam that retargets a tool's "deliver
 * the result" call between standalone (browser download) and workflow
 * (advance to next step) modes.
 *
 * Tools call `output.deliver(bytes, "_suffix", sourceFile)` exactly
 * where they used to call `downloadPdf(bytes, pdfFilename(file, suffix))`.
 * Standalone behavior is byte-for-byte identical to the previous code;
 * workflow behavior calls the runner's `onComplete` instead.
 *
 * Tools that produce intermediate state before the final download
 * (e.g. CompressPdf shows size stats first) can read `output.inWorkflow`
 * to skip the result panel and auto-deliver — see CompressPdf for the
 * pattern.
 */

import { useWorkflowSlot } from "../workflow/WorkflowContext.tsx";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";

export interface ToolOutput {
  /** True when this tool is rendered as a workflow step. */
  inWorkflow: boolean;
  /** True when this tool is the last step of a running workflow. */
  isLastStep: boolean;
  /**
   * Deliver the produced PDF. Standalone → triggers a browser download
   * named `<source>${suffix}.pdf`. Workflow → forwards bytes to the
   * runner, which uses `suffix` only when this is the final step.
   */
  deliver: (bytes: Uint8Array, suffix: string, sourceFile: File) => void;
  /**
   * Tell a workflow runner this step has nothing to do. Standalone is
   * a no-op (the tool's own UI handles "nothing to do" messaging).
   */
  skip: (reason: string) => void;
}

export function useToolOutput(): ToolOutput {
  const slot = useWorkflowSlot();
  return {
    inWorkflow: slot !== null,
    isLastStep: slot?.isLastStep ?? false,
    deliver(bytes, suffix, sourceFile) {
      if (slot) {
        slot.onComplete(bytes, suffix);
      } else {
        downloadPdf(bytes, pdfFilename(sourceFile, suffix));
      }
    },
    skip(reason) {
      slot?.onSkip(reason);
    },
  };
}
