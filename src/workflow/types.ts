/**
 * Workflow data model.
 *
 * A workflow is a saved, ordered list of tool IDs the user wants to run
 * back-to-back on a single PDF. The output of step N becomes the input
 * of step N+1. Each step inflates the existing tool component as-is at
 * run time — no per-tool config is captured at design time.
 */

import type { ToolId } from "../types.ts";

/** A single step in a workflow — just the tool to run, nothing else. */
export interface WorkflowStep {
  tool: ToolId;
}

/** A user-saved workflow. */
export interface Workflow {
  id: string;
  name: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of the most recent edit. */
  updatedAt: string;
  steps: WorkflowStep[];
}

/** Storage envelope. Versioned so the schema can evolve. */
export interface WorkflowStore {
  version: 1;
  workflows: Workflow[];
}
