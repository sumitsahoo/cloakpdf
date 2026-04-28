/**
 * localStorage-backed persistence for user workflows.
 *
 * Stored under a single key as a versioned envelope so the schema can
 * evolve without breaking existing entries. All operations are pure:
 * they read/write the envelope and never mutate prior values in place.
 *
 * `safeParse` defends against:
 *   - the key missing (first run)
 *   - the value being corrupted JSON
 *   - the value matching the envelope shape but being from an older
 *     version (currently only v1 exists; older versions would short-
 *     circuit to an empty list rather than throw)
 */

import type { Workflow, WorkflowStore } from "./types.ts";

const STORAGE_KEY = "cloakpdf.workflows.v1";

const EMPTY: WorkflowStore = { version: 1, workflows: [] };

function safeParse(raw: string | null): WorkflowStore {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowStore>;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.workflows)) {
      return { version: 1, workflows: parsed.workflows as Workflow[] };
    }
  } catch {
    /* fall through */
  }
  return EMPTY;
}

/** Read all saved workflows, newest first. */
export function loadWorkflows(): Workflow[] {
  const store = safeParse(localStorage.getItem(STORAGE_KEY));
  return [...store.workflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Persist the full list (replaces whatever is currently stored).
 *
 * Throws a friendly `Error` when the browser refuses the write — most
 * commonly `QuotaExceededError` when storage is full, or `SecurityError`
 * in Safari private browsing. Callers surface the message to the user.
 */
export function saveWorkflows(workflows: Workflow[]): void {
  const envelope: WorkflowStore = { version: 1, workflows };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      throw new Error("Browser storage is full — delete an old workflow and try again.");
    }
    throw new Error("Couldn't save to browser storage. Private browsing may be blocking it.");
  }
}

/** Insert a new workflow or update the one whose id matches. */
export function upsertWorkflow(workflow: Workflow): void {
  const all = loadWorkflows();
  const idx = all.findIndex((w) => w.id === workflow.id);
  if (idx >= 0) all[idx] = workflow;
  else all.push(workflow);
  saveWorkflows(all);
}

/** Remove the workflow with the given id (no-op if missing). */
export function deleteWorkflow(id: string): void {
  saveWorkflows(loadWorkflows().filter((w) => w.id !== id));
}

/**
 * Generate a workflow id. `crypto.randomUUID` is widely supported in
 * modern browsers; fall back to a timestamped random suffix on older
 * runtimes so the function never throws.
 */
export function newWorkflowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Import / export ──────────────────────────────────────────────

/**
 * Shape of a JSON file produced by `serializeForExport`. We always
 * emit an array under `workflows` even for a single export so the
 * import path has one code path regardless of how many workflows the
 * user shares. The `kind` discriminator lets future versions detect
 * "is this our file?" without sniffing fields.
 */
export interface WorkflowExport {
  kind: "cloakpdf-workflows";
  version: 1;
  exportedAt: string;
  workflows: Workflow[];
}

/** Build the JSON payload for one or more workflows. */
export function serializeForExport(workflows: Workflow[]): WorkflowExport {
  return {
    kind: "cloakpdf-workflows",
    version: 1,
    exportedAt: new Date().toISOString(),
    workflows,
  };
}

/** Coerce a parsed JSON value into a list of valid workflows. */
function isStep(value: unknown): value is { tool: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "tool" in value &&
    typeof (value as { tool: unknown }).tool === "string"
  );
}

function isWorkflow(value: unknown): value is Workflow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    Array.isArray(v.steps) &&
    v.steps.every(isStep)
  );
}

/**
 * Parse and validate a JSON string into an array of workflows. Accepts
 * three shapes for resilience:
 *   1. A `WorkflowExport` envelope (preferred — what we emit).
 *   2. A raw `{ version, workflows }` storage envelope (in case the
 *      user copies the localStorage value directly).
 *   3. A bare `Workflow[]` array.
 *
 * Returns `null` when the input doesn't match any recognised shape.
 */
export function parseImport(json: string): Workflow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  // Envelope shapes
  if (typeof parsed === "object" && parsed !== null && "workflows" in parsed) {
    const list = (parsed as { workflows: unknown }).workflows;
    if (Array.isArray(list) && list.every(isWorkflow)) return list as Workflow[];
    return null;
  }
  // Bare array
  if (Array.isArray(parsed) && parsed.every(isWorkflow)) return parsed as Workflow[];

  return null;
}

/**
 * Merge imported workflows into the existing store. Conflict policy:
 * an imported workflow whose id already exists is given a fresh id so
 * the user never silently loses a local edit. Returns the count of
 * workflows that were actually written.
 */
export function importWorkflows(imported: Workflow[]): number {
  const existing = loadWorkflows();
  const existingIds = new Set(existing.map((w) => w.id));
  const now = new Date().toISOString();
  const merged: Workflow[] = [...existing];
  for (const wf of imported) {
    const id = existingIds.has(wf.id) ? newWorkflowId() : wf.id;
    merged.push({ ...wf, id, updatedAt: now });
    existingIds.add(id);
  }
  saveWorkflows(merged);
  return imported.length;
}

/** Slugify a workflow name for use in an export filename. */
export function workflowFilename(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workflow";
  return `cloakpdf-workflow-${slug}.json`;
}
