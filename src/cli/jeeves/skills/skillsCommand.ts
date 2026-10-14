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

import { getWorkspacePath } from '../../../init.js';
import { getPackageRoot } from '../../../plugin/getPackageRoot.js';
import { getErrorMessage } from '../../../utils.js';
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
