/**
 * Run a list of OpenClaw dist patches independently, in-process: a failure
 * in one never skips the rest.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/lib/patch-runner.ts` and
 * `patch-openclaw.ts` (jeeves-core 0.7.0, #121), adapted to run
 * each patch as a direct function call (no `tsx` child process — jeeves
 * ships compiled JS) and to never restart the gateway (Decision 70): the
 * caller folds `changed`/`failed` into install/update reporting instead.
 *
 * @module
 */

import { getErrorMessage } from '../../../utils.js';
import type { PatchLogger, PatchOutcome } from './distPatchIo.js';

/** One registered dist patch. */
export interface DistPatch {
  /** Patch name, e.g. `tool-order`. */
  name: string;
  /** Run the patch against a resolved dist directory. */
  run: (distDir: string, dryRun: boolean, logger?: PatchLogger) => PatchOutcome;
}

/** Aggregate result of running every registered patch once. */
export interface PatchRunReport {
  /** `true` when at least one patch wrote (or, in dry-run, would write). */
  changed: boolean;
  /** `true` when at least one patch failed (`not-found` or `error`). */
  failed: boolean;
  /** Per-patch outcomes, in registration order. */
  results: PatchOutcome[];
}

/** Whether an outcome is a failure. */
const isFailure = (r: PatchOutcome): boolean =>
  r.status === 'not-found' || r.status === 'error';

/** Run every patch, converting throws into failed outcomes. */
export function runAllPatches(
  patches: readonly DistPatch[],
  distDir: string,
  dryRun: boolean,
  logger?: PatchLogger,
): PatchOutcome[] {
  return patches.map((patch) => {
    try {
      return patch.run(distDir, dryRun, logger);
    } catch (err) {
      return {
        name: patch.name,
        status: 'error',
        message: getErrorMessage(err),
      };
    }
  });
}

/** Reduce per-patch outcomes to the aggregate `changed`/`failed` report. */
export function summarizePatchRun(results: PatchOutcome[]): PatchRunReport {
  return {
    changed: results.some((r) => r.status === 'patched'),
    failed: results.some(isFailure),
    results,
  };
}

/** Human-readable per-patch summary lines. */
export function formatPatchSummary(results: readonly PatchOutcome[]): string[] {
  const lines = results.map(
    (r) =>
      `  ${isFailure(r) ? 'FAILED  ' : 'OK      '}${r.name} — ${r.message}`,
  );
  const failed = results.filter(isFailure).length;
  lines.push(
    failed === 0
      ? `  All ${String(results.length)} patches succeeded.`
      : `  ${String(failed)} of ${String(results.length)} patches FAILED.`,
  );
  return lines;
}
