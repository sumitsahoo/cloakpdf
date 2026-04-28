/**
 * Landing page for the Workflows feature.
 *
 * Shows the user's saved workflows (from localStorage) and a primary
 * CTA to create a new one. Each saved workflow renders as a card with
 * Run / Edit / Export / Delete actions. A toolbar above the grid lets
 * the user export every workflow at once or import a JSON file someone
 * else shared with them.
 *
 * Design language matches the home tool grid: rounded-2xl cards with
 * the same hover lift, primary accent on key actions, slate neutrals
 * for everything else.
 */

import {
  Download,
  FileJson,
  Info,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { findTool } from "../config/tool-registry.ts";
import { downloadBlob } from "../utils/file-helpers.ts";
import {
  deleteWorkflow,
  importWorkflows,
  loadWorkflows,
  parseImport,
  serializeForExport,
  workflowFilename,
} from "./storage.ts";
import type { Workflow } from "./types.ts";

interface WorkflowsHomeProps {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onRun: (id: string) => void;
}

export function WorkflowsHome({ onCreate, onEdit, onRun }: WorkflowsHomeProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Workflow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkflows(loadWorkflows());
  }, []);

  const refresh = useCallback(() => setWorkflows(loadWorkflows()), []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deleteWorkflow(pendingDelete.id);
    setPendingDelete(null);
    refresh();
  }, [pendingDelete, refresh]);

  const handleExportOne = useCallback((wf: Workflow) => {
    const blob = new Blob([JSON.stringify(serializeForExport([wf]), null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, workflowFilename(wf.name));
  }, []);

  const handleExportAll = useCallback(() => {
    const all = loadWorkflows();
    if (all.length === 0) return;
    const blob = new Blob([JSON.stringify(serializeForExport(all), null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "cloakpdf-workflows.json");
  }, []);

  const handleImportFile = useCallback(
    (file: File) => {
      void file.text().then((text) => {
        const parsed = parseImport(text);
        if (!parsed) {
          setNotice({ kind: "err", text: "Couldn't read that file — is it a workflow export?" });
          return;
        }
        const count = importWorkflows(parsed);
        refresh();
        setNotice({
          kind: "ok",
          text: `Imported ${count} workflow${count === 1 ? "" : "s"}.`,
        });
      });
    },
    [refresh],
  );

  // Auto-dismiss the notice after a few seconds so it doesn't pile up.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="space-y-6">
      {/* Single hidden file input — both the header "Import" button and
          the empty-state CTA trigger it via fileInputRef. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
          e.target.value = "";
        }}
        className="hidden"
        aria-label="Import workflow JSON"
      />

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center shrink-0">
          <WorkflowIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
            Workflows
          </h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">
            Chain tools together and run them on a single PDF in sequence.
          </p>
        </div>
      </div>

      <InfoCallout icon={Info} title="Not every tool can be chained">
        Workflows operate on a single PDF in, single PDF out. Tools that take multiple files (Merge,
        Images to PDF), need a second PDF (Compare), produce non-PDF output (PDF to Image, Extract
        Images, Contact Sheet), or are read-only / security-sensitive (Inspector, Password, Digital
        Signature) are excluded — the picker only shows workflow-eligible tools.
      </InfoCallout>

      {/* Options row — sits beneath the title card, the same pattern
          tools use for their option controls (e.g. compression-level
          buttons sit beneath the FileInfoBar). Hidden in the empty
          state because the empty hero owns those CTAs. The transient
          status message sits inline so it appears next to the action
          that produced it. */}
      {workflows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text text-[13px] font-medium transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text text-[13px] font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export all
          </button>
          {notice && (
            <span
              role="status"
              className={`ml-1 text-[12.5px] font-medium ${
                notice.kind === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {notice.text}
            </span>
          )}
        </div>
      )}

      {/* Status for the empty state — there are no buttons in this row,
          so the notice gets its own line so the user sees the import
          error / success message after clicking the empty-state CTA. */}
      {workflows.length === 0 && notice && (
        <p
          role="status"
          className={`text-[12.5px] font-medium ${
            notice.kind === "ok"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {notice.text}
        </p>
      )}

      {workflows.length === 0 ? (
        <EmptyState onCreate={onCreate} onImportClick={() => fileInputRef.current?.click()} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CreateCard onCreate={onCreate} />
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onEdit={() => onEdit(wf.id)}
              onRun={() => onRun(wf.id)}
              onExport={() => handleExportOne(wf)}
              onDelete={() => setPendingDelete(wf)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete workflow?"
        description={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from this browser. This can't be undone — export it first if you want a copy.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

interface EmptyStateProps {
  onCreate: () => void;
  onImportClick: () => void;
}

function EmptyState({ onCreate, onImportClick }: EmptyStateProps) {
  return (
    <div className="bg-white/70 dark:bg-dark-surface/70 backdrop-blur-sm border border-slate-200 dark:border-dark-border rounded-2xl px-6 py-12 sm:px-10 sm:py-16 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
        <WorkflowIcon className="w-7 h-7 text-primary-600 dark:text-primary-400" />
      </div>
      <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
        No workflows yet
      </h2>
      <p className="text-[14px] text-slate-500 dark:text-dark-text-muted mt-2 max-w-md mx-auto leading-[1.55]">
        Pick a few tools, save them as a workflow, and run them in order on any PDF — clean,
        compress, and watermark in one go.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium text-[14px] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create your first workflow
        </button>
        <button
          type="button"
          onClick={onImportClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text font-medium text-[14px] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import from JSON
        </button>
      </div>
    </div>
  );
}

function CreateCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group relative bg-white dark:bg-dark-surface rounded-2xl border-2 border-dashed border-slate-300 dark:border-dark-border px-5 py-6 sm:p-6 text-left cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md flex flex-col gap-2"
    >
      <span className="w-11 h-11 rounded-xl grid place-items-center bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-2 transition-[transform,background-color] duration-200 group-hover:-translate-y-px group-hover:scale-105">
        <Plus className="w-5 h-5" />
      </span>
      <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text">
        Create workflow
      </h3>
      <p className="text-[13px] leading-normal text-slate-500 dark:text-dark-text-muted">
        Pick tools and save the order to reuse later.
      </p>
    </button>
  );
}

interface WorkflowCardProps {
  workflow: Workflow;
  onEdit: () => void;
  onRun: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function WorkflowCard({ workflow, onEdit, onRun, onExport, onDelete }: WorkflowCardProps) {
  const stepCount = workflow.steps.length;
  // Show up to three step icons as a visual summary; degrade gracefully
  // for shorter workflows.
  const summaryIcons = workflow.steps
    .slice(0, 3)
    .map((s) => findTool(s.tool))
    .filter((t) => t !== null);

  return (
    <div className="group relative bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border px-5 py-5 sm:p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {summaryIcons.length > 0 ? (
          <div className="flex -space-x-1.5">
            {summaryIcons.map((t, i) => {
              const Icon = t.icon;
              return (
                <span
                  key={t.id}
                  className="w-9 h-9 rounded-xl border-2 border-white dark:border-dark-surface bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text grid place-items-center"
                  style={{ zIndex: summaryIcons.length - i }}
                >
                  <Icon className="w-4 h-4" />
                </span>
              );
            })}
          </div>
        ) : (
          <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-dark-surface-alt grid place-items-center">
            <WorkflowIcon className="w-4 h-4 text-slate-500 dark:text-dark-text-muted" />
          </span>
        )}
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-dark-text-muted">
          {stepCount} {stepCount === 1 ? "step" : "steps"}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text truncate">
          {workflow.name}
        </h3>
        <p className="text-[12.5px] text-slate-500 dark:text-dark-text-muted truncate mt-0.5">
          {workflow.steps.map((s) => findTool(s.tool)?.title ?? s.tool).join(" → ")}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onRun}
          disabled={stepCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Run
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface-alt hover:bg-slate-200 dark:hover:bg-dark-border text-slate-700 dark:text-dark-text text-[13px] font-medium transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onExport}
          className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text transition-colors"
          aria-label={`Export ${workflow.name} as JSON`}
          title="Export as JSON"
        >
          <FileJson className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 dark:text-dark-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label={`Delete ${workflow.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
