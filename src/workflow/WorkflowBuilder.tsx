/**
 * Workflow builder.
 *
 * The dumbest possible builder per the design philosophy — just an
 * ordered list of tool ids with a name. No per-step config (those are
 * captured at run time when the tool's UI inflates). Add steps via a
 * tool picker, reorder with up/down buttons, name & save.
 *
 * Mounted in two modes:
 *  - "create": empty state, blank name field
 *  - "edit":   pre-populated with the workflow being edited (by id)
 */

import { ArrowDown, ArrowUp, Check, Plus, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBox } from "../components/AlertBox.tsx";
import { findTool } from "../config/tool-registry.ts";
import type { ToolId } from "../types.ts";
import { errorMessage } from "../utils/file-helpers.ts";
import { loadWorkflows, newWorkflowId, upsertWorkflow } from "./storage.ts";
import { ToolPickerModal } from "./ToolPickerModal.tsx";
import type { Workflow, WorkflowStep } from "./types.ts";

interface WorkflowBuilderProps {
  /** When set, edit the existing workflow with this id; otherwise create. */
  workflowId: string | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function WorkflowBuilder({ workflowId, onCancel, onSaved }: WorkflowBuilderProps) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydrate from storage when editing. `workflowId` is stable for the
  // lifetime of this view (App.tsx remounts the builder when switching
  // between create and edit), so this runs at most once per mount.
  useEffect(() => {
    if (!workflowId) return;
    const found = loadWorkflows().find((w) => w.id === workflowId);
    if (found) {
      setName(found.name);
      setSteps(found.steps);
      setCreatedAt(found.createdAt);
    }
  }, [workflowId]);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addStep = useCallback((tool: ToolId) => {
    setSteps((prev) => [...prev, { tool }]);
    setPickerOpen(false);
  }, []);

  // Pass the current tool ids into the picker so it can mark them with
  // an "Added" badge (re-adding a tool is allowed — workflows can repeat
  // a step — but the visual hint is useful).
  const addedToolIds = useMemo(() => new Set(steps.map((s) => s.tool)), [steps]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim() || "Untitled workflow";
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: workflowId ?? newWorkflowId(),
      name: trimmedName,
      createdAt: createdAt ?? now,
      updatedAt: now,
      steps,
    };
    try {
      upsertWorkflow(workflow);
    } catch (e) {
      setSaveError(errorMessage(e, "Couldn't save the workflow."));
      return;
    }
    onSaved();
  }, [name, steps, workflowId, createdAt, onSaved]);

  const canSave = steps.length > 0 && name.trim().length > 0;

  // Hint string surfaced near the Save button when it's disabled — tells
  // the user *which* requirement is missing instead of just dimming the
  // button silently.
  const missingHint =
    name.trim().length === 0 && steps.length === 0
      ? "Name your workflow and add at least one step."
      : name.trim().length === 0
        ? "Give your workflow a name to save it."
        : steps.length === 0
          ? "Add at least one step to save."
          : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center shrink-0">
          <WorkflowIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
            {workflowId ? "Edit workflow" : "New workflow"}
          </h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">
            Pick tools in the order you want them to run on a PDF.
          </p>
        </div>
      </div>

      <div className="bg-white/70 dark:bg-dark-surface/70 backdrop-blur-sm border border-slate-200 dark:border-dark-border rounded-2xl p-5 sm:p-6 space-y-6">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-dark-text-muted">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Clean & ship"
            maxLength={60}
            className="mt-2 w-full px-4 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-300 dark:focus:border-primary-600 transition-[border-color,box-shadow] duration-200 text-[15px]"
          />
          <span className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-slate-400 dark:text-dark-text-muted">
            <span>Used in the workflows list and the run header.</span>
            <span className="tabular-nums shrink-0">{name.length}/60</span>
          </span>
        </label>

        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-dark-text-muted">
                Steps
              </span>
              {steps.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-semibold tabular-nums">
                  {steps.length}
                </span>
              )}
            </span>
            {steps.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add step
              </button>
            )}
          </div>

          {steps.length === 0 ? (
            <div className="bg-slate-50/70 dark:bg-dark-surface-alt/40 border border-dashed border-slate-300 dark:border-dark-border rounded-2xl px-6 py-10 sm:py-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                <WorkflowIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text">
                No steps yet
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-dark-text-muted mt-1 max-w-sm mx-auto leading-[1.55]">
                Pick tools in the order you want them to run — each step's output feeds the next.
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[14px] font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add your first step
              </button>
            </div>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <StepRow
                  key={`${step.tool}-${index}`}
                  index={index}
                  step={step}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  onUp={() => moveStep(index, -1)}
                  onDown={() => moveStep(index, 1)}
                  onRemove={() => removeStep(index)}
                />
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3 pt-1">
        {saveError && <AlertBox message={saveError} />}
        <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto sm:min-w-55 px-8 py-3 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt text-slate-700 dark:text-dark-text font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto sm:min-w-55 px-8 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            Save workflow
          </button>
        </div>
        {missingHint && (
          <p className="text-[12.5px] text-slate-500 dark:text-dark-text-muted text-center">
            {missingHint}
          </p>
        )}
      </div>

      {pickerOpen && (
        <ToolPickerModal
          onPick={addStep}
          onClose={() => setPickerOpen(false)}
          alreadyAdded={addedToolIds}
        />
      )}
    </div>
  );
}

interface StepRowProps {
  index: number;
  step: WorkflowStep;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}

function StepRow({ index, step, isFirst, isLast, onUp, onDown, onRemove }: StepRowProps) {
  const meta = findTool(step.tool);
  const Icon = meta?.icon;

  return (
    <li className="flex items-center gap-3 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-xl px-3 py-3 sm:px-4">
      <span className="shrink-0 w-7 h-7 rounded-full bg-primary-50 dark:bg-primary-900/40 inline-flex items-center justify-center text-[12px] font-semibold leading-none tabular-nums text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-800/60">
        {index + 1}
      </span>
      <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 dark:bg-dark-surface-alt grid place-items-center text-slate-700 dark:text-dark-text">
        {Icon ? <Icon className="w-4 h-4" /> : null}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text truncate">
          {meta?.title ?? step.tool}
        </div>
        <div className="text-[12.5px] text-slate-500 dark:text-dark-text-muted truncate">
          {meta?.description ?? "Unknown tool"}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onUp}
          disabled={isFirst}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Move up"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={isLast}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Move down"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 dark:text-dark-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label="Remove step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}
