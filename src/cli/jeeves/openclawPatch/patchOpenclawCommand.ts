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

import { RESTART_NOTICE } from '../cliOutput.js';
import type { PatchRunReport } from './patchRunner.js';
import {
  formatPatchSummary,
  runAllPatches,
  summarizePatchRun,
} from './patchRunner.js';
import { resolveOpenClawDist } from './resolveOpenclawDist.js';
import { runToolOrderPatch, TOOL_ORDER_PATCH_NAME } from './toolOrderPatch.js';

/** Patches run by `jeeves patch-openclaw`, in order. */
const DIST_PATCHES = [{ name: TOOL_ORDER_PATCH_NAME, run: runToolOrderPatch }];

/**
 * Run every registered OpenClaw dist patch and print a summary.
 *
 * @remarks
 * Programmatic entry point used by `install` and `update`. Internal:
 * not part of the public package API.
 *
 * @param options - `dryRun`: when true, nothing is written.
 * @returns The aggregate patch run report.
 */
export function runOpenClawPatches(options: {
  dryRun: boolean;
}): PatchRunReport {
  const { dryRun } = options;
  let distDir: string;
  try {
    distDir = resolveOpenClawDist();
  } catch (err) {
    // No OpenClaw install found: report a failure instead of throwing, so
    // install/update finish their other work and exit non-zero.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[patch-openclaw] FAILED: ${message}`);
    return summarizePatchRun([
      { name: 'openclaw-dist', status: 'error', message },
    ]);
  }
  console.log(
    `[patch-openclaw] ${dryRun ? 'DRY RUN — ' : ''}OpenClaw dist: ${distDir}`,
  );

  const results = runAllPatches(DIST_PATCHES, distDir, dryRun);

  console.log(
    `\n[patch-openclaw] Summary${dryRun ? ' (DRY RUN — nothing written)' : ''}:`,
  );
  for (const line of formatPatchSummary(results)) console.log(line);

  return summarizePatchRun(results);
}

/**
 * Register the `patch-openclaw` subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerPatchOpenClawCommand(program: Command): void {
  program
    .command('patch-openclaw')
    .description(
      'Apply post-install runtime patches to the installed OpenClaw dist',
    )
    .option('--dry-run', 'Print what would change and write nothing')
    .action((rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
      const report = runOpenClawPatches({ dryRun });

      if (report.changed && !dryRun) {
        console.log();
        console.log(RESTART_NOTICE);
      }

      if (report.failed) process.exitCode = 1;
    });
}
