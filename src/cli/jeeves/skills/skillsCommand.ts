/**
 * The `jeeves skills` command group: `install`, `uninstall` and `status`,
 * with `--managed`, `--self-hosted` and `--dry-run` (spec section 5
 * scope C; Decision 71). Wires this package's shipped skill folders into
 * OpenClaw's `skills.load.extraDirs` without copying them.
 *
 * @remarks
 * Unlike `jeeves-scripts skills`, this command never prompts: every
 * mutation applies directly (`--dry-run` previews instead). `--managed`
 * wires `skills/` only; `--self-hosted` wires both `skills/` and
 * `skills-self-hosted/`; with neither, the mode is inferred from the
 * current wiring (see `skillsModel.ts`). `status` is read-only and never
 * fails on shadowing. Programmatic entry point ({@link runSkillsCommand})
 * used by `jeeves install`/`update`/`uninstall`/`status`. Internal: not
 * part of the public package API.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';
import { z } from 'zod';

import { getWorkspacePath } from '../../../init.js';
import { getPackageRoot } from '../../../plugin/getPackageRoot.js';
import { getErrorMessage } from '../../../utils.js';
import { initFromOptions, type WorkspaceOptions } from '../cliDefaults.js';
import { DRY_RUN_COMPLETE } from '../cliOutput.js';
import { formatCommand } from '../plugins/commandLine.js';
import {
  type CommandRunner,
  spawnCommandRunner,
} from '../plugins/commandRunner.js';
import {
  BATCH_FILE_PLACEHOLDER,
  configBatchPayload,
  configSetBatchFileArgs,
  configUnsetArgs,
  OPENCLAW_BIN,
} from '../plugins/openclawCommands.js';
import type { OptionTarget } from '../plugins/pluginConfigCli.js';
import {
  createNodePrivateTempFiles,
  type PrivateTempFiles,
} from '../plugins/privateTempFile.js';
import { discoverSkillNames, resolveSkillsFolders } from './skillsFolders.js';
import {
  applyConfigSetBatch,
  applyConfigUnset,
  readSkillsConfig,
} from './skillsIo.js';
import {
  inferMode,
  installChange,
  isOwnEntry,
  resolveModeFlag,
  type SkillsChange,
  type SkillsContext,
  type SkillsMode,
  statusLines,
  uninstallChange,
} from './skillsModel.js';
import {
  defaultShadowSources,
  findShadows,
  type ShadowSource,
} from './skillsShadow.js';

/** Which `jeeves skills` subcommand is running. */
export type SkillsAction = 'install' | 'uninstall' | 'status';

/** Ports {@link runSkillsCommand} needs (production defaults when omitted). */
export interface SkillsCommandPorts {
  /** Command runner (tests inject a fake). */
  runner?: CommandRunner;
  /** Owner-only temp file port (tests inject a fake). */
  tempFiles?: PrivateTempFiles;
  /** Line logger (default: `console.log`). */
  log?: (line: string) => void;
  /** Failure logger (default: `console.error`). */
  error?: (line: string) => void;
  /** This package's root (default: resolved from `import.meta.url`). */
  packageRoot?: string;
  /**
   * Skill sources checked for same-named skills (`status`; default:
   * {@link defaultShadowSources}).
   */
  shadowSources?: readonly ShadowSource[];
}

/** Options for {@link runSkillsCommand}. */
export interface RunSkillsOptions extends SkillsCommandPorts {
  /** Print only; mutate nothing (ignored for `status`, already read-only). */
  dryRun?: boolean;
  /** Explicit mode (`install` only; inferred when omitted). */
  mode?: SkillsMode;
}

/** Result of {@link runSkillsCommand}. */
export interface SkillsCommandResult {
  /** Process exit code (`1` on failure). */
  exitCode: number;
  /** Whether a change was computed (`install`/`uninstall`), applied or not. */
  changed: boolean;
}

/** Preview lines for a change: the exact `config set`/`unset` command lines. */
function describeChangeLines(change: SkillsChange): string[] {
  const lines: string[] = [];
  if (change.sets.length > 0) {
    lines.push(
      formatCommand(
        OPENCLAW_BIN,
        configSetBatchFileArgs(BATCH_FILE_PLACEHOLDER),
      ),
      `  batch file content: ${configBatchPayload(change.sets)}`,
    );
  }
  for (const unsetPath of change.unsets) {
    lines.push(formatCommand(OPENCLAW_BIN, configUnsetArgs(unsetPath)));
  }
  return lines;
}

/**
 * Run `skills install | uninstall | status`.
 *
 * @param action - Which subcommand.
 * @param options - Ports and flags.
 * @returns The exit code and whether a change was computed.
 */
export async function runSkillsCommand(
  action: SkillsAction,
  options: RunSkillsOptions,
): Promise<SkillsCommandResult> {
  const runner = options.runner ?? spawnCommandRunner;
  const tempFiles = options.tempFiles ?? createNodePrivateTempFiles(runner);
  const log =
    options.log ??
    ((line: string) => {
      console.log(line);
    });
  const logError =
    options.error ??
    ((line: string) => {
      console.error(line);
    });
  const dryRun = options.dryRun === true;
  const packageRoot = options.packageRoot ?? getPackageRoot(import.meta.url);

  if (!packageRoot) {
    logError(`skills ${action}: FAILED: could not resolve the package root`);
    return { exitCode: 1, changed: false };
  }

  const folders = resolveSkillsFolders(packageRoot);

  try {
    const config = await readSkillsConfig(runner);
    const context: SkillsContext = { folders, config };

    if (action === 'status') {
      const mode = inferMode(context);
      const providedSkills = {
        generic: discoverSkillNames(folders.generic),
        selfHosted: discoverSkillNames(folders.selfHosted),
      };
      const sources =
        options.shadowSources ??
        defaultShadowSources({
          workspace: getWorkspacePath(),
          extraDirs: config.load?.extraDirs ?? [],
          isOwnEntry: (entry) => isOwnEntry(entry, folders),
        });
      const shadows = findShadows(
        [...providedSkills.generic, ...providedSkills.selfHosted],
        sources,
      );
      for (const line of statusLines(context, {
        mode,
        providedSkills,
        shadows,
      })) {
        log(line);
      }
      return { exitCode: 0, changed: false };
    }

    const mode = options.mode ?? inferMode(context);
    const change =
      action === 'install'
        ? installChange(context, mode)
        : uninstallChange(context);
    const changed = change.sets.length > 0 || change.unsets.length > 0;

    if (!changed) {
      log(`skills ${action}: nothing to change`);
      return { exitCode: 0, changed: false };
    }

    log(`skills ${action}: this changes OpenClaw's config:`);
    for (const line of describeChangeLines(change)) log(line);

    if (dryRun) {
      log(`skills ${action}: dry run, nothing applied`);
      return { exitCode: 0, changed: true };
    }

    if (change.sets.length > 0) {
      await applyConfigSetBatch(runner, tempFiles, change.sets, log);
    }
    for (const unsetPath of change.unsets) {
      await applyConfigUnset(runner, unsetPath);
    }

    log(`skills ${action}: applied`);
    return { exitCode: 0, changed: true };
  } catch (e) {
    logError(`skills ${action}: FAILED: ${getErrorMessage(e)}`);
    return { exitCode: 1, changed: false };
  }
}

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
