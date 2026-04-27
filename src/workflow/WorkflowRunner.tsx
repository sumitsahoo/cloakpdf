/**
 * Workflow runner — drives a saved workflow on a single PDF.
 *
 * Stage 1: file drop. The user supplies the PDF that becomes the input
 * to the first step. We accept the same `.pdf` mime type as every tool.
 *
 * Stage 2: step execution. For each step we mount the tool's existing
 * component inside a `WorkflowContext`. The context injects the current
 * intermediate file and intercepts the tool's `output.deliver` call to
 * advance to the next step (or trigger the final download). A horizontal
 * stepper above the tool view shows progress and lets the user see what
 * is coming next.
 *
 * Skip handling: a tool that calls `output.skip(reason)` (e.g. blank
 * page detection finding nothing) advances the runner without producing
 * a new file — the prior intermediate flows through unchanged. The
 * reason is shown briefly as a chip on the stepper.
 *
 * Final download: when the last step delivers, we download the result
 * as `<originalName><suffixChain>.pdf` so the user can read what
 * happened from the filename alone (e.g. `report_cleaned_compressed.pdf`).
 */

import { Check, ChevronRight, FileUp, X } from "lucide-react";
import { Suspense, useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { findTool, findToolComponent } from "../config/tool-registry.ts";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { loadWorkflows } from "./storage.ts";
import { WorkflowContext, type WorkflowSlot } from "./WorkflowContext.tsx";

interface WorkflowRunnerProps {
  workflowId: string;
  onExit: () => void;
}

export function WorkflowRunner({ workflowId, onExit }: WorkflowRunnerProps) {
  const workflow = useMemo(
    () => loadWorkflows().find((w) => w.id === workflowId) ?? null,
    [workflowId],
  );

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [suffixChain, setSuffixChain] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);

  const handleStart = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setOriginalFile(f);
    setCurrentFile(f);
    setStepIndex(0);
    setSuffixChain([]);
    setDone(false);
    setSkipNotice(null);
  }, []);

  const handleReset = useCallback(() => {
    setOriginalFile(null);
    setCurrentFile(null);
    setStepIndex(0);
    setSuffixChain([]);
    setDone(false);
    setSkipNotice(null);
  }, []);

  const advance = useCallback(
    (nextFile: File | null, suffix: string | null) => {
      if (!workflow) return;
      const isLast = stepIndex >= workflow.steps.length - 1;
      if (isLast) {
        // Final step: trigger download with full suffix chain.
        if (nextFile && originalFile && suffix !== null) {
          void nextFile.arrayBuffer().then((buf) => {
            const chain = [...suffixChain, suffix].join("");
            downloadPdf(new Uint8Array(buf), pdfFilename(originalFile, chain || "_processed"));
          });
        }
        setDone(true);
        return;
      }
      // Intermediate step: prepare the next step's input.
      if (nextFile) setCurrentFile(nextFile);
      if (suffix !== null) setSuffixChain((prev) => [...prev, suffix]);
      setStepIndex((i) => i + 1);
    },
    [workflow, stepIndex, suffixChain, originalFile],
  );

  // Slot is recreated every step transition so the tool component sees a
  // new identity and remounts cleanly (avoids stale state from the prior
  // step's render). React.memo on the tool itself isn't a concern — these
  // are top-level lazy components that always re-render with new props.
  const slot = useMemo<WorkflowSlot | null>(() => {
    if (!workflow || !currentFile) return null;
    return {
      injectedFile: currentFile,
      isLastStep: stepIndex >= workflow.steps.length - 1,
      onComplete: (bytes, suffix) => {
        const stepTool = workflow.steps[stepIndex]?.tool ?? "step";
        const pseudoFile = new File([bytes as BlobPart], `${stepTool}.pdf`, {
          type: "application/pdf",
        });
        setSkipNotice(null);
        advance(pseudoFile, suffix);
      },
      onSkip: (reason) => {
        setSkipNotice(reason);
        // Pass the current file through unchanged.
        advance(currentFile, "");
      },
    };
  }, [workflow, currentFile, stepIndex, advance]);

  if (!workflow) {
    return (
      <div className="space-y-4">
        <AlertBox message="Workflow not found." />
        <button
          type="button"
          onClick={onExit}
          className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text font-medium text-[14px]"
        >
          Back to workflows
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center shrink-0">
          <FileUp className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text truncate">
            {workflow.name}
          </h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">
            {workflow.steps.length} {workflow.steps.length === 1 ? "step" : "steps"}
          </p>
        </div>
      </div>

      <Stepper steps={workflow.steps.map((s) => s.tool)} currentIndex={stepIndex} done={done} />

      {!originalFile ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleStart}
          label="Drop a PDF to start the workflow"
          hint="The PDF will be processed by each step in order"
        />
      ) : done ? (
        <FinalState originalFile={originalFile} onRunAgain={handleReset} onExit={onExit} />
      ) : (
        <>
          <FileInfoBar
            fileName={originalFile.name}
            details={formatFileSize(originalFile.size)}
            onChangeFile={handleReset}
            extra={
              <>
                {" · step "}
                <span className="text-primary-600 dark:text-primary-400 font-medium">
                  {stepIndex + 1} of {workflow.steps.length}
                </span>
              </>
            }
          />

          {skipNotice && (
            <InfoCallout icon={Check} accent="organise">
              {skipNotice} — moved to the next step.
            </InfoCallout>
          )}

          {slot && <StepHost slot={slot} toolId={workflow.steps[stepIndex].tool} />}
        </>
      )}
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────

interface StepperProps {
  steps: string[];
  currentIndex: number;
  done: boolean;
}

function Stepper({ steps, currentIndex, done }: StepperProps) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {steps.map((toolId, i) => {
        const meta = findTool(toolId);
        const Icon = meta?.icon;
        const isCurrent = !done && i === currentIndex;
        const isComplete = done || i < currentIndex;
        return (
          <li key={`${toolId}-${i}`} className="flex items-center gap-1.5 shrink-0">
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
                isCurrent
                  ? "border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  : isComplete
                    ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                    : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-500 dark:text-dark-text-muted"
              }`}
            >
              {isComplete ? (
                <Check className="w-3.5 h-3.5" />
              ) : Icon ? (
                <Icon className="w-3.5 h-3.5" />
              ) : null}
              <span className="whitespace-nowrap">{meta?.title ?? toolId}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-dark-border shrink-0" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── StepHost ─────────────────────────────────────────────────────

interface StepHostProps {
  slot: WorkflowSlot;
  toolId: string;
}

/**
 * Mounts a single tool component inside `WorkflowContext`. Re-keyed by
 * step index so each step gets a fresh instance — prevents the prior
 * step's internal state from leaking into the next.
 */
function StepHost({ slot, toolId }: StepHostProps) {
  const meta = findTool(toolId);
  const Component = findToolComponent(toolId as Parameters<typeof findToolComponent>[0]);

  if (!meta || !Component) {
    return <AlertBox message={`Unknown tool: ${toolId}`} />;
  }

  return (
    <WorkflowContext.Provider value={slot}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner className="" />
          </div>
        }
      >
        <Component />
      </Suspense>
    </WorkflowContext.Provider>
  );
}

// ── Final state ──────────────────────────────────────────────────

interface FinalStateProps {
  originalFile: File;
  onRunAgain: () => void;
  onExit: () => void;
}

function FinalState({ originalFile, onRunAgain, onExit }: FinalStateProps) {
  return (
    <div className="space-y-4">
      <InfoCallout icon={Check} accent="transform">
        Workflow finished. Your processed PDF (based on{" "}
        <span className="font-semibold">{originalFile.name}</span>) has been downloaded.
      </InfoCallout>
      <div className="flex items-center gap-2">
        <ActionButton
          onClick={onRunAgain}
          processing={false}
          label="Run on another file"
          processingLabel=""
        />
        <button
          type="button"
          onClick={onExit}
          className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text font-medium text-[14px] transition-colors flex items-center gap-1.5"
        >
          <X className="w-4 h-4" />
          Exit
        </button>
      </div>
    </div>
  );
}
