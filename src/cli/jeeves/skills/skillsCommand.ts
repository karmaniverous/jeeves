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
 * reused by step 10 (`jeeves install`/`update`/`uninstall`/`status`);
 * exposed internally only, not part of the public package API unless knip
 * requires otherwise.
 *
 * @module
 */

import path from 'node:path';

import type { Command } from '@commander-js/extra-typings';

import { getWorkspacePath } from '../../../init.js';
import { getPackageRoot } from '../../../plugin/getPackageRoot.js';
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
import {
  createNodePrivateTempFiles,
  type PrivateTempFiles,
} from '../plugins/privateTempFile.js';
import { listSkillNames, resolveSkillsFolders } from './skillsFolders.js';
import {
  applyConfigSetBatch,
  applyConfigUnset,
  readSkillsConfig,
} from './skillsIo.js';
import {
  inferMode,
  installChange,
  resolveModeFlag,
  type SkillsChange,
  type SkillsContext,
  type SkillsMode,
  statusLines,
  uninstallChange,
} from './skillsModel.js';

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
  /** Workspace `skills/` directory, for shadow detection (`status`). */
  workspaceSkillsDir?: string;
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
      const workspaceSkillsDir =
        options.workspaceSkillsDir ?? path.join(getWorkspacePath(), 'skills');
      const providedSkills = {
        generic: listSkillNames(folders.generic),
        selfHosted: listSkillNames(folders.selfHosted),
      };
      const workspaceSkillNames = listSkillNames(workspaceSkillsDir);
      for (const line of statusLines(context, {
        mode,
        providedSkills,
        workspaceSkillNames,
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
    logError(
      `skills ${action}: FAILED: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { exitCode: 1, changed: false };
  }
}

/** Options shared by every `jeeves skills` subcommand. */
type SkillsSubOptions = WorkspaceOptions & { dryRun?: boolean };

/**
 * Register the `jeeves skills` command group on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description(
      "Wire this package's shipped skill folders into OpenClaw (Decision 71)",
    );

  skills
    .command('install')
    .description(
      'Wire skills/ (--managed) or skills/ and skills-self-hosted/ (--self-hosted, default on a fresh install) into skills.load.extraDirs',
    )
    .option('--managed', 'Wire skills/ only')
    .option('--self-hosted', 'Wire both skills/ and skills-self-hosted/')
    .option('--dry-run', 'Print the exact config change and apply nothing')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action(
      async (
        opts: SkillsSubOptions & { managed?: boolean; selfHosted?: boolean },
      ) => {
        initFromOptions(opts);
        const mode = resolveModeFlag(
          opts.managed === true,
          opts.selfHosted === true,
        );
        const result = await runSkillsCommand('install', {
          dryRun: opts.dryRun === true,
          ...(mode ? { mode } : {}),
        });
        if (opts.dryRun === true) console.log(DRY_RUN_COMPLETE);
        if (result.exitCode !== 0) process.exitCode = 1;
      },
    );

  skills
    .command('uninstall')
    .description("Remove exactly this package's skills.load.extraDirs entries")
    .option('--dry-run', 'Print the exact config change and apply nothing')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action(async (opts: SkillsSubOptions) => {
      initFromOptions(opts);
      const result = await runSkillsCommand('uninstall', {
        dryRun: opts.dryRun === true,
      });
      if (opts.dryRun === true) console.log(DRY_RUN_COMPLETE);
      if (result.exitCode !== 0) process.exitCode = 1;
    });

  skills
    .command('status')
    .description(
      'Report the inferred mode, each folder (wired/missing/stale), the skills each provides, and shadowing (read-only)',
    )
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action(async (opts: WorkspaceOptions) => {
      initFromOptions(opts);
      const result = await runSkillsCommand('status', {});
      if (result.exitCode !== 0) process.exitCode = 1;
    });
}
