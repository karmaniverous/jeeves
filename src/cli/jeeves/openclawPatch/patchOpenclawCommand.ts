/**
 * `jeeves patch-openclaw` — apply post-install runtime patches to the
 * installed OpenClaw dist (hoisted from jeeves-scripts-template, #121).
 *
 * @remarks
 * Runs every registered dist patch in-process (no child process, no
 * `tsx`) against the resolved OpenClaw dist directory. Each patch is
 * independent: a failure in one never skips the rest. `--dry-run` prints
 * what would change and writes nothing. Never restarts the gateway
 * (Decision 70): when a live run changes the dist, prints the shared
 * `RESTART_NOTICE` from `cliOutput.ts` instead.
 *
 * Only the `tool-order` patch is registered. `patch-also-allow-policy`
 * is not hoisted: the underlying OpenClaw behavior it worked around is
 * upstream-fixed. `install` and `update` run this step through
 * {@link runOpenClawPatches}.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { getErrorMessage } from '../../../utils.js';
import { RESTART_NOTICE } from '../cliOutput.js';
import { consolePatchLogger, type PatchLogger } from './distPatchIo.js';
import {
  type DistPatch,
  formatPatchSummary,
  type PatchRunReport,
  runAllPatches,
  summarizePatchRun,
} from './patchRunner.js';
import { resolveOpenClawDist } from './resolveOpenclawDist.js';
import { runToolOrderPatch, TOOL_ORDER_PATCH_NAME } from './toolOrderPatch.js';

/** Patches run by `jeeves patch-openclaw`, in order. */
const DIST_PATCHES: readonly DistPatch[] = [
  { name: TOOL_ORDER_PATCH_NAME, run: runToolOrderPatch },
];

/** Options for {@link runOpenClawPatches}. */
export interface RunOpenClawPatchesOptions {
  /** When true, nothing is written. */
  dryRun: boolean;
  /** Where progress lines go (default: the console). */
  logger?: PatchLogger;
  /** Locate the OpenClaw dist (default: {@link resolveOpenClawDist}). */
  resolveDist?: () => string;
  /** Patches to run (default: every registered patch). */
  patches?: readonly DistPatch[];
}

/**
 * Run every registered OpenClaw dist patch and print a summary.
 *
 * @remarks
 * Programmatic entry point used by `install` and `update`. Internal:
 * not part of the public package API. A missing OpenClaw install is
 * reported as a failed outcome rather than thrown, so install/update
 * finish their other work and exit non-zero.
 *
 * @param options - Dry-run flag and injectable ports.
 * @returns The aggregate patch run report.
 */
export function runOpenClawPatches(
  options: RunOpenClawPatchesOptions,
): PatchRunReport {
  const {
    dryRun,
    logger = consolePatchLogger,
    resolveDist = resolveOpenClawDist,
    patches = DIST_PATCHES,
  } = options;

  let distDir: string;
  try {
    distDir = resolveDist();
  } catch (err) {
    const message = getErrorMessage(err);
    logger.error(`[patch-openclaw] FAILED: ${message}`);
    return summarizePatchRun([
      { name: 'openclaw-dist', status: 'error', message },
    ]);
  }
  logger.log(
    `[patch-openclaw] ${dryRun ? 'DRY RUN — ' : ''}OpenClaw dist: ${distDir}`,
  );

  const results = runAllPatches(patches, distDir, dryRun, logger);

  logger.log(
    `\n[patch-openclaw] Summary${dryRun ? ' (DRY RUN — nothing written)' : ''}:`,
  );
  for (const line of formatPatchSummary(results)) logger.log(line);

  return summarizePatchRun(results);
}

/**
 * Register the `patch-openclaw` subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 * @param ports - Injectable ports for {@link runOpenClawPatches} (tests).
 */
export function registerPatchOpenClawCommand(
  program: Command,
  ports: Omit<RunOpenClawPatchesOptions, 'dryRun'> = {},
): void {
  program
    .command('patch-openclaw')
    .description(
      'Apply post-install runtime patches to the installed OpenClaw dist',
    )
    .option('--dry-run', 'Print what would change and write nothing')
    .action((rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
      const report = runOpenClawPatches({ ...ports, dryRun });
      const logger = ports.logger ?? consolePatchLogger;

      if (report.changed && !dryRun) {
        logger.log('');
        logger.log(RESTART_NOTICE);
      }

      if (report.failed) process.exitCode = 1;
    });
}
