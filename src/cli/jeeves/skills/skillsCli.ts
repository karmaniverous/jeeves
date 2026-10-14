/**
 * The `jeeves skills` command group (Decision 71): registration, the
 * `--managed`/`--self-hosted` flags shared with `jeeves install` and
 * `jeeves update`, and the mapping of results to output and exit code.
 * The work itself is {@link runSkillsCommand}.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';
import { z } from 'zod';

import { initFromOptions, type WorkspaceOptions } from '../cliDefaults.js';
import { DRY_RUN_COMPLETE } from '../cliOutput.js';
import type { OptionTarget } from '../plugins/pluginConfigCli.js';
import {
  runSkillsCommand,
  type SkillsAction,
  type SkillsCommandPorts,
} from './skillsCommand.js';
import { resolveModeFlag, type SkillsMode } from './skillsModel.js';

/** Help text for the two skills mode flags. */
export interface SkillsModeHelp {
  managed: string;
  selfHosted: string;
}

/**
 * Add `--managed` and `--self-hosted` to a command. Shared by
 * `jeeves skills install`, `jeeves install` and `jeeves update`.
 *
 * @param command - The command to extend.
 * @param help - Help text for each flag.
 */
export function addSkillsModeOptions(
  command: OptionTarget,
  help: SkillsModeHelp,
): void {
  command.option('--managed', help.managed);
  command.option('--self-hosted', help.selfHosted);
}

const skillsModeCliSchema = z.object({
  managed: z.boolean().optional(),
  selfHosted: z.boolean().optional(),
});

/**
 * The explicit skills mode from parsed CLI options (see
 * {@link addSkillsModeOptions}).
 *
 * @param rawOpts - Commander's parsed options.
 * @returns The mode, or `undefined` when neither flag is given.
 * @throws When both flags are given.
 */
export function skillsModeFromCli(rawOpts: unknown): SkillsMode | undefined {
  const { managed, selfHosted } = skillsModeCliSchema.parse(rawOpts);
  return resolveModeFlag(managed === true, selfHosted === true);
}

/** Options shared by every `jeeves skills` subcommand. */
type SkillsSubOptions = WorkspaceOptions & { dryRun?: boolean };

/** Add `--dry-run` (mutating subcommands) and the workspace options. */
function addSubOptions(command: OptionTarget, dryRun: boolean): void {
  if (dryRun) {
    command.option(
      '--dry-run',
      'Print the exact config change and apply nothing',
    );
  }
  command.option('-w, --workspace <path>', 'Workspace root path');
  command.option('-c, --config-root <path>', 'Platform config root path');
}

/**
 * Register the `jeeves skills` command group on the parent CLI program.
 *
 * @param program - The parent Commander program.
 * @param ports - Ports passed to {@link runSkillsCommand} (tests).
 */
export function registerSkillsCommand(
  program: Command,
  ports: SkillsCommandPorts = {},
): void {
  const skills = program
    .command('skills')
    .description(
      "Wire this package's shipped skill folders into OpenClaw (Decision 71)",
    );

  /** Run a subcommand and map its result to output and the exit code. */
  const run = async (
    action: SkillsAction,
    opts: SkillsSubOptions,
    mode?: SkillsMode,
  ): Promise<void> => {
    initFromOptions(opts);
    const dryRun = opts.dryRun === true;
    const result = await runSkillsCommand(action, {
      ...ports,
      dryRun,
      ...(mode ? { mode } : {}),
    });
    if (dryRun) (ports.log ?? console.log)(DRY_RUN_COMPLETE);
    if (result.exitCode !== 0) process.exitCode = 1;
  };

  const install = skills
    .command('install')
    .description(
      'Wire skills/ (--managed) or skills/ and skills-self-hosted/ (--self-hosted, default on a fresh install) into skills.load.extraDirs',
    );
  addSkillsModeOptions(install, {
    managed: 'Wire skills/ only',
    selfHosted: 'Wire both skills/ and skills-self-hosted/',
  });
  addSubOptions(install, true);
  install.action(async (opts: SkillsSubOptions) => {
    await run('install', opts, skillsModeFromCli(opts));
  });

  const uninstall = skills
    .command('uninstall')
    .description("Remove exactly this package's skills.load.extraDirs entries");
  addSubOptions(uninstall, true);
  uninstall.action(async (opts: SkillsSubOptions) => {
    await run('uninstall', opts);
  });

  const status = skills
    .command('status')
    .description(
      'Report the inferred mode, each folder (wired/missing/stale), the skills each provides, and same-named skills in other sources (read-only)',
    );
  addSubOptions(status, false);
  status.action(async (opts: SkillsSubOptions) => {
    await run('status', opts);
  });
}
