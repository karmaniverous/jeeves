/**
 * Memory budget accounting for MEMORY.md.
 *
 * @remarks
 * Reports character count against a configured budget and warning threshold
 * state. Does not auto-delete: review remains human- or agent-mediated
 * (Decision 42). Staleness detection removed in v0.5.9 (Decision 45).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKSPACE_FILES } from '../constants/paths.js';

/** Result of memory hygiene analysis. */
export interface MemoryHygieneResult {
  /** Whether MEMORY.md exists. */
  exists: boolean;
  /** Total character count. */
  charCount: number;
  /** Configured budget in characters. */
  budget: number;
  /** Usage as a fraction of budget (0–1+). */
  usage: number;
  /** Whether usage exceeds the warning threshold. */
  warning: boolean;
  /** Whether usage exceeds the budget. */
  overBudget: boolean;
}

/** Options for memory hygiene analysis. */
export interface MemoryHygieneOptions {
  /** Workspace root path. */
  workspacePath: string;
  /** Character budget. */
  budget: number;
  /** Warning threshold as a fraction of budget (0–1). */
  warningThreshold: number;
}

/**
 * Analyze MEMORY.md for budget health.
 *
 * @param options - Analysis configuration.
 * @returns Memory hygiene result.
 */
export function analyzeMemory(
  options: MemoryHygieneOptions,
): MemoryHygieneResult {
  const { workspacePath, budget, warningThreshold } = options;
  const memoryPath = join(workspacePath, WORKSPACE_FILES.memory);

  if (!existsSync(memoryPath)) {
    return {
      exists: false,
      charCount: 0,
      budget,
      usage: 0,
      warning: false,
      overBudget: false,
    };
  }

  const content = readFileSync(memoryPath, 'utf-8');
  const charCount = content.length;
  const usage = budget > 0 ? charCount / budget : charCount > 0 ? Infinity : 0;
  const warning = usage >= warningThreshold;
  const overBudget = usage > 1;

  return {
    exists: true,
    charCount,
    budget,
    usage,
    warning,
    overBudget,
  };
}
