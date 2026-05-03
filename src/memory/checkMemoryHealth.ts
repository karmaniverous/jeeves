/**
 * HEARTBEAT integration for memory hygiene.
 *
 * @remarks
 * Calls `analyzeMemory()` and converts the result into a `HeartbeatEntry`
 * suitable for inclusion in the HEARTBEAT.md platform status section.
 * Returns `undefined` when MEMORY.md is healthy (no alert needed).
 *
 * Uses the `## MEMORY.md` heading (Decision 50) to distinguish memory
 * alerts from component alerts (`## jeeves-{name}`).
 */

import type { HeartbeatEntry } from '../managed/heartbeat.js';
import { analyzeMemory, type MemoryHygieneOptions } from './memoryHygiene.js';

/** The HEARTBEAT heading name for memory alerts. */
export const MEMORY_HEARTBEAT_NAME = 'MEMORY.md';

/**
 * Check memory health and return a HEARTBEAT entry if unhealthy.
 *
 * @param options - Memory hygiene options (workspacePath, budget, etc.).
 * @returns A `HeartbeatEntry` when memory needs attention, `undefined` when healthy.
 */
export function checkMemoryHealth(
  options: MemoryHygieneOptions,
): HeartbeatEntry | undefined {
  const result = analyzeMemory(options);

  if (!result.exists) return undefined;
  if (!result.warning) return undefined;

  const pct = Math.round(result.usage * 100);
  const content = `- Budget: ${result.charCount.toLocaleString()} / ${result.budget.toLocaleString()} chars (${String(pct)}%).${result.overBudget ? ' **Over budget.**' : ' Consider reviewing.'}`;

  return {
    name: MEMORY_HEARTBEAT_NAME,
    declined: false,
    content,
  };
}
