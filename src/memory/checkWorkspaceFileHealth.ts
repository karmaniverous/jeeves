/**
 * HEARTBEAT integration for workspace file size monitoring.
 *
 * @remarks
 * Checks all injected workspace files (AGENTS.md, SOUL.md, TOOLS.md,
 * MEMORY.md, USER.md) against the OpenClaw ~20,000-char injection limit.
 * Files exceeding the warning threshold generate HEARTBEAT entries with
 * trimming guidance.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HeartbeatEntry } from '../managed/heartbeat.js';

/** Workspace files monitored for size budget. */
export const WORKSPACE_SIZE_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'MEMORY.md',
  'USER.md',
] as const;

/** Options for workspace file health checks. */
export interface WorkspaceFileHealthOptions {
  /** Workspace root path. */
  workspacePath: string;
  /** Character budget per file. Default: 20,000. */
  budgetChars?: number;
  /** Warning threshold as a fraction of budget. Default: 0.8 (80%). */
  warningThreshold?: number;
}

/** Health result for a single workspace file. */
export interface WorkspaceFileHealthResult {
  /** File name, e.g. 'AGENTS.md'. */
  file: string;
  /** Whether the file exists. */
  exists: boolean;
  /** Measured character count (0 if file does not exist). */
  charCount: number;
  /** Character budget used for this check. */
  budget: number;
  /** Usage ratio (charCount / budget). */
  usage: number;
  /** True when usage \>= warningThreshold. */
  warning: boolean;
  /** True when charCount \> budget. */
  overBudget: boolean;
}

/**
 * Check all workspace files against the character budget.
 *
 * @param options - Health check options.
 * @returns Array of results, one per checked file (skips non-existent files
 *   unless they breach the budget, which they cannot by definition).
 */
export function checkWorkspaceFileHealth(
  options: WorkspaceFileHealthOptions,
): WorkspaceFileHealthResult[] {
  const {
    workspacePath,
    budgetChars = 20_000,
    warningThreshold = 0.8,
  } = options;

  return WORKSPACE_SIZE_FILES.map((file) => {
    const filePath = join(workspacePath, file);
    if (!existsSync(filePath)) {
      return {
        file,
        exists: false,
        charCount: 0,
        budget: budgetChars,
        usage: 0,
        warning: false,
        overBudget: false,
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const charCount = content.length;
    const usage = charCount / budgetChars;
    return {
      file,
      exists: true,
      charCount,
      budget: budgetChars,
      usage,
      warning: usage >= warningThreshold,
      overBudget: charCount > budgetChars,
    };
  });
}

/**
 * Convert workspace file health results into HEARTBEAT entries.
 *
 * @param results - Results from `checkWorkspaceFileHealth`.
 * @returns Array of `HeartbeatEntry` objects for files that exceed the
 *   warning threshold.
 */
export function workspaceFileHealthEntries(
  results: WorkspaceFileHealthResult[],
): HeartbeatEntry[] {
  return results
    .filter((r) => r.exists && r.warning)
    .map((r) => {
      const pct = Math.round(r.usage * 100);
      const overBudgetNote = r.overBudget ? ' **Over budget.** ' : ' ';
      const content = [
        `${r.file} is at ${String(pct)}% of its 20K char injection budget (${r.charCount.toLocaleString()} / ${r.budget.toLocaleString()} chars).${overBudgetNote}Action required:`,
        '',
        '1. Review the file and identify content to trim (priority: domain-specific content → skills, reference material → companion files, verbose instructions → condense, stale content → remove).',
        '2. Ask the owner for permission, then trim.',
        "3. If the owner declines, change this heading to '## " +
          r.file +
          ": declined' to suppress this alert.",
        '',
        'Do NOT reply HEARTBEAT_OK while this alert is unresolved.',
      ].join('\n');
      return {
        name: r.file,
        declined: false,
        content,
      };
    });
}
