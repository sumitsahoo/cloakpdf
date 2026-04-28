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

import { ArrowLeft, Check, FileUp } from "lucide-react";
import { Suspense, useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { findTool, findToolComponent } from "../config/tool-registry.ts";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, errorMessage, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
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
  const [runError, setRunError] = useState<string | null>(null);

  const handleStart = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setOriginalFile(f);
    setCurrentFile(f);
    setStepIndex(0);
    setSuffixChain([]);
    setDone(false);
    setSkipNotice(null);
    setRunError(null);
  }, []);

  const handleReset = useCallback(() => {
    setOriginalFile(null);
    setCurrentFile(null);
    setStepIndex(0);
    setSuffixChain([]);
    setDone(false);
    setSkipNotice(null);
    setRunError(null);
  }, []);

  // `advance` accepts the produced bytes directly so the final-step
  // download doesn't re-buffer through `File.arrayBuffer()`. For
  // intermediate steps we still wrap bytes in a `File` because the
  // next step's `usePdfFile` consumes a `File` reference. `delivered`
  // is `null` on skip — the prior file flows through unchanged.
  const advance = useCallback(
    (delivered: { bytes: Uint8Array; sourceTool: string } | null, suffix: string | null) => {
      if (!workflow) return;
      const isLast = stepIndex >= workflow.steps.length - 1;
      if (isLast) {
        if (suffix === null || !originalFile) {
          setDone(true);
          return;
        }
        const chain = [...suffixChain, suffix].join("");
        const filename = pdfFilename(originalFile, chain || "_processed");
        if (delivered) {
          try {
            downloadPdf(delivered.bytes, filename);
            setDone(true);
          } catch (e) {
            setRunError(errorMessage(e, "Couldn't trigger the download."));
          }
          return;
        }
        // Skip-as-final-step: re-read the prior file's bytes for the
        // download. Rare path — only when the last step opted out.
        if (currentFile) {
          currentFile
            .arrayBuffer()
            .then((buf) => {
              downloadPdf(new Uint8Array(buf), filename);
              setDone(true);
            })
            .catch((e) =>
              setRunError(errorMessage(e, "Couldn't read the final file for download.")),
            );
          return;
        }
        setDone(true);
        return;
      }
      if (delivered) {
        const pseudoFile = new File(
          [delivered.bytes as Uint8Array<ArrayBuffer>],
          `${delivered.sourceTool}.pdf`,
          { type: "application/pdf" },
        );
        setCurrentFile(pseudoFile);
      }
      if (suffix !== null) setSuffixChain((prev) => [...prev, suffix]);
      setStepIndex((i) => i + 1);
    },
    [workflow, stepIndex, suffixChain, originalFile, currentFile],
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
        const sourceTool = workflow.steps[stepIndex]?.tool ?? "step";
        setSkipNotice(null);
        advance({ bytes, sourceTool }, suffix);
      },
      onSkip: (reason) => {
        setSkipNotice(reason);
        advance(null, "");
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
            // Only the first step's PDF is the user's actual upload —
            // from step 2 onward the file is an intermediate, so
            // "Change file" would be misleading. Pass undefined so
            // FileInfoBar hides the link (resetting mid-run is still
            // available via the back-arrow / exiting the workflow).
            onChangeFile={stepIndex === 0 ? handleReset : undefined}
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

          {runError && <AlertBox message={runError} />}

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

/**
 * Responsive workflow stepper.
 *
 * Phone: a compact "Step X of Y" header with a thin progress bar and
 * the current step's name + icon — full chip chain on a 320px screen
 * just becomes a horizontal scroll graveyard.
 *
 * Desktop (sm+): numbered circles connected by progress lines, with
 * the tool title beneath each circle. Completed segments fill green;
 * the current circle is ringed for emphasis.
 */
function Stepper({ steps, currentIndex, done }: StepperProps) {
  const total = steps.length;
  const completedCount = done ? total : currentIndex;
  const progressPct = total <= 1 ? (done ? 100 : 0) : (completedCount / (total - 1)) * 100;
  const currentMeta = findTool(steps[currentIndex] ?? "");
  const CurrentIcon = currentMeta?.icon;

  return (
    <div>
      {/* Mobile: condensed progress view */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-slate-700 dark:text-dark-text">
            {done ? "Completed" : `Step ${currentIndex + 1} of ${total}`}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-dark-text-muted tabular-nums">
            {completedCount} / {total}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-dark-surface-alt rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              done
                ? "bg-emerald-500"
                : "bg-linear-to-r from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-400"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {!done && currentMeta && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800/60 text-[12px] font-medium text-primary-700 dark:text-primary-300">
            {CurrentIcon && <CurrentIcon className="w-3.5 h-3.5" />}
            <span>{currentMeta.title}</span>
          </div>
        )}
      </div>

      {/* Desktop: numbered circles + connecting lines + labels */}
      <ol className="hidden sm:flex items-start gap-0 overflow-x-auto px-1 py-1">
        {steps.map((toolId, i) => {
          const meta = findTool(toolId);
          const isCurrent = !done && i === currentIndex;
          const isComplete = done || i < currentIndex;
          const isLast = i === steps.length - 1;
          return (
            <li key={`${toolId}-${i}`} className="flex items-start shrink-0 min-w-0">
              <div className="flex flex-col items-center min-w-0 max-w-34 lg:max-w-40">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold transition-colors ${
                    isCurrent
                      ? "bg-primary-500 text-white ring-4 ring-primary-100 dark:ring-primary-900/40"
                      : isComplete
                        ? "bg-emerald-500 text-white"
                        : "bg-white dark:bg-dark-surface text-slate-500 dark:text-dark-text-muted border border-slate-200 dark:border-dark-border"
                  }`}
                >
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span
                  className={`mt-1.5 px-1 text-[11.5px] font-medium text-center leading-tight truncate w-full ${
                    isCurrent
                      ? "text-primary-700 dark:text-primary-300"
                      : isComplete
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-500 dark:text-dark-text-muted"
                  }`}
                  title={meta?.title ?? toolId}
                >
                  {meta?.title ?? toolId}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-0.5 w-6 lg:w-10 mt-3 mx-1 rounded-full transition-colors ${
                    isComplete
                      ? "bg-emerald-500 dark:bg-emerald-500"
                      : "bg-slate-200 dark:bg-dark-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
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
        <span className="wrap-anywhere">
          Workflow finished. Your processed PDF (based on{" "}
          <span className="font-semibold">{originalFile.name}</span>) has been downloaded.
        </span>
      </InfoCallout>
      <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-center gap-2">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto sm:min-w-55 px-8 py-3 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt text-slate-700 dark:text-dark-text font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workflows
        </button>
        <ActionButton
          onClick={onRunAgain}
          processing={false}
          label="Run on another file"
          processingLabel=""
        />
      </div>
    </div>
  );
}
