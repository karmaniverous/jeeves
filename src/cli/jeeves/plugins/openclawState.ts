/**
 * Read-only queries against the `openclaw` and `npm` CLIs: prerequisite
 * probe, `plugins` config slice, exact version resolution.
 *
 * @remarks
 * All calls go through the {@link CommandRunner} port and never mutate
 * anything, so they also run under `--dry-run`.
 *
 * @module
 */

import {
  CommandFailedError,
  type CommandRunner,
  formatCommand,
  runChecked,
} from './commandRunner.js';
import { type PluginsConfig, pluginsConfigSchema } from './configPatch.js';
import {
  configGetArgs,
  NPM_BIN,
  npmViewVersionArgs,
  OPENCLAW_BIN,
  openclawVersionArgs,
} from './openclawCommands.js';

/** Thrown when the `openclaw` executable cannot be started at all. */
export class OpenClawNotFoundError extends Error {
  /** @param cause - The spawn error. */
  constructor(cause: unknown) {
    super(
      'OpenClaw CLI not found on PATH. Install OpenClaw first; jeeves does not install its prerequisites.',
      { cause },
    );
    this.name = 'OpenClawNotFoundError';
  }
}

/** Prefix of OpenClaw's `config get` message for an unset path. */
const UNSET_MESSAGE = 'Config path is valid but unset';

/**
 * Verify the OpenClaw CLI is installed (spec §4.9: a prerequisite, never
 * installed by Jeeves).
 *
 * @param runner - Command runner.
 * @returns The `openclaw --version` line.
 */
export async function assertOpenClawAvailable(
  runner: CommandRunner,
): Promise<string> {
  try {
    const { stdout } = await runChecked(
      runner,
      OPENCLAW_BIN,
      openclawVersionArgs(),
    );
    return stdout.trim();
  } catch (error) {
    if (error instanceof CommandFailedError) throw error;
    throw new OpenClawNotFoundError(error);
  }
}

/** Whether a failed `config get --json` means "path unset". */
function isUnsetResponse(stdout: string): boolean {
  try {
    const body = JSON.parse(stdout) as {
      error?: { message?: unknown };
    };
    const message = body.error?.message;
    return typeof message === 'string' && message.startsWith(UNSET_MESSAGE);
  } catch {
    return false;
  }
}

/**
 * Read the `plugins` config slice via `openclaw config get plugins --json`.
 *
 * @param runner - Command runner.
 * @returns The parsed slice (`{}` when unset).
 */
export async function readPluginsConfig(
  runner: CommandRunner,
): Promise<PluginsConfig> {
  const args = configGetArgs('plugins');
  const result = await runner(OPENCLAW_BIN, args);
  if (result.exitCode !== 0) {
    if (isUnsetResponse(result.stdout)) return {};
    throw new CommandFailedError(formatCommand(OPENCLAW_BIN, args), result);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `Unexpected non-JSON output from ${formatCommand(OPENCLAW_BIN, args)}`,
      { cause: error },
    );
  }
  return pluginsConfigSchema.parse(raw);
}

/**
 * Resolve a version, range, or dist-tag to one exact published version.
 *
 * @param runner - Command runner.
 * @param packageName - Scoped npm package name.
 * @param range - Version, range, or dist-tag.
 * @returns The highest matching version.
 */
export async function resolveExactVersion(
  runner: CommandRunner,
  packageName: string,
  range: string,
): Promise<string> {
  const args = npmViewVersionArgs(packageName, range);
  const { stdout } = await runChecked(runner, NPM_BIN, args);
  const trimmed = stdout.trim();
  const parsed: unknown = trimmed ? JSON.parse(trimmed) : undefined;
  const versions = Array.isArray(parsed) ? parsed : [parsed];
  const version: unknown = versions[versions.length - 1];
  if (typeof version !== 'string' || !version) {
    throw new Error(
      `No published version of ${packageName} matches "${range}".`,
    );
  }
  return version;
}
