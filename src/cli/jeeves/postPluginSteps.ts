/**
 * The steps `jeeves install` and `jeeves update` both run after plugins:
 * the OpenClaw dist patch step (#121, skipped with `--skip-patch`) and the
 * skills step (`jeeves skills install`, Decision 71).
 *
 * @remarks
 * Neither step stops the other or the command: each failure is folded
 * into {@link PostPluginResult.failed} so the caller finishes its work
 * and exits non-zero. A live (non-dry-run) dist change is reported in
 * {@link PostPluginResult.distChanged} for the caller's single restart
 * notice. Nothing here restarts the gateway (Decision 70).
 *
 * @module
 */

import { z } from 'zod';

import { runOpenClawPatches } from './openclawPatch/patchOpenclawCommand.js';
import type { PatchRunReport } from './openclawPatch/patchRunner.js';
import type { OptionTarget } from './plugins/pluginConfigCli.js';
import {
  addSkillsModeOptions,
  runSkillsCommand,
  type RunSkillsOptions,
  type SkillsCommandResult,
} from './skills/skillsCommand.js';
import type { SkillsMode } from './skills/skillsModel.js';

/**
 * Add `--skip-patch`, `--managed` and `--self-hosted` to `install` or
 * `update`.
 *
 * @param command - The command to extend.
 * @param selfHostedHelp - `--self-hosted` help (the default differs).
 */
export function addPostPluginOptions(
  command: OptionTarget,
  selfHostedHelp: string,
): void {
  command.option(
    '--skip-patch',
    'Skip the OpenClaw dist patch step (jeeves patch-openclaw)',
  );
  addSkillsModeOptions(command, {
    managed: 'Skills: wire skills/ only (jeeves skills install --managed)',
    selfHosted: selfHostedHelp,
  });
}

/**
 * Whether `--skip-patch` was given (see {@link addPostPluginOptions}).
 *
 * @param rawOpts - Commander's parsed options.
 * @returns `true` when the dist patch step should be skipped.
 */
export const skipPatchFromCli = (rawOpts: unknown): boolean =>
  z.object({ skipPatch: z.boolean().optional() }).parse(rawOpts).skipPatch ===
  true;

/** Options for {@link runPostPluginSteps}. */
export interface PostPluginOptions {
  /** When true, nothing is written. */
  dryRun: boolean;
  /** Skip the dist patch step. */
  skipPatch: boolean;
  /** Explicit skills mode (inferred when omitted). */
  skillsMode?: SkillsMode;
  /** Patch step (default: {@link runOpenClawPatches}; tests). */
  runPatches?: (opts: { dryRun: boolean }) => PatchRunReport;
  /** Skills step (default: `runSkillsCommand('install', …)`; tests). */
  runSkills?: (opts: RunSkillsOptions) => Promise<SkillsCommandResult>;
}

/** Aggregate outcome of {@link runPostPluginSteps}. */
export interface PostPluginResult {
  /** Whether either step failed. */
  failed: boolean;
  /** Whether a live run changed the OpenClaw dist (restart needed). */
  distChanged: boolean;
}

/**
 * Run the dist patch step, then the skills step.
 *
 * @param options - Flags and injectable steps.
 * @returns Whether anything failed and whether the dist changed.
 */
export async function runPostPluginSteps(
  options: PostPluginOptions,
): Promise<PostPluginResult> {
  const {
    dryRun,
    skipPatch,
    skillsMode,
    runPatches = runOpenClawPatches,
    runSkills = (opts) => runSkillsCommand('install', opts),
  } = options;

  let patchFailed = false;
  let distChanged = false;
  if (!skipPatch) {
    console.log();
    const report = runPatches({ dryRun });
    patchFailed = report.failed;
    distChanged = report.changed && !dryRun;
  }

  console.log();
  const skills = await runSkills({
    dryRun,
    ...(skillsMode ? { mode: skillsMode } : {}),
  });

  return { failed: patchFailed || skills.exitCode !== 0, distChanged };
}
