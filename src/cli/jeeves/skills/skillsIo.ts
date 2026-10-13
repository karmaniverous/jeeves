/**
 * OpenClaw I/O for `jeeves skills`: read the `skills` config slice (tolerant
 * of "not set"), and apply a change via one `config set --batch-file` call
 * plus `config unset` calls.
 *
 * @remarks
 * Mirrors `plugins/openclawState.ts`'s `readPluginsConfig` for the `skills`
 * path.
 *
 * @module
 */

import { parseJson } from '../../../utils.js';
import { formatCommand } from '../plugins/commandLine.js';
import {
  CommandFailedError,
  type CommandRunner,
  runChecked,
} from '../plugins/commandRunner.js';
import {
  BATCH_FILE_NAME,
  configBatchPayload,
  configGetArgs,
  configSetBatchFileArgs,
  type ConfigSetOperation,
  configUnsetArgs,
  OPENCLAW_BIN,
} from '../plugins/openclawCommands.js';
import {
  type PrivateTempFiles,
  withPrivateTempFile,
} from '../plugins/privateTempFile.js';
import { type SkillsConfig, skillsConfigSchema } from './skillsModel.js';

/** Prefix of OpenClaw's `config get` message for an unset path. */
const UNSET_MESSAGE = 'Config path is valid but unset';

/** Whether a failed `config get --json` means "path unset". */
function isUnsetResponse(stdout: string): boolean {
  try {
    const body = JSON.parse(stdout) as { error?: { message?: unknown } };
    const message = body.error?.message;
    return typeof message === 'string' && message.startsWith(UNSET_MESSAGE);
  } catch {
    return false;
  }
}

/**
 * Read the `skills` config slice via `openclaw config get skills --json`.
 *
 * @param runner - Command runner.
 * @returns The parsed slice (`{}` when unset).
 */
export async function readSkillsConfig(
  runner: CommandRunner,
): Promise<SkillsConfig> {
  const args = configGetArgs('skills');
  const result = await runner(OPENCLAW_BIN, args);
  if (result.exitCode !== 0) {
    if (isUnsetResponse(result.stdout)) return {};
    throw new CommandFailedError(formatCommand(OPENCLAW_BIN, args), result);
  }
  return skillsConfigSchema.parse(
    parseJson(
      result.stdout,
      `Unexpected non-JSON output from ${formatCommand(OPENCLAW_BIN, args)}`,
    ),
  );
}

/**
 * Apply `config set` operations with one `--batch-file` call, through an
 * owner-only temp file deleted afterwards.
 *
 * @param runner - Command runner.
 * @param tempFiles - Owner-only temp file port.
 * @param ops - Operations (non-empty).
 * @param warn - Warning logger (temp-dir ACL restriction failure).
 */
export async function applyConfigSetBatch(
  runner: CommandRunner,
  tempFiles: PrivateTempFiles,
  ops: readonly ConfigSetOperation[],
  warn: (line: string) => void,
): Promise<void> {
  await withPrivateTempFile(
    tempFiles,
    BATCH_FILE_NAME,
    configBatchPayload(ops),
    async (path) => {
      await runChecked(runner, OPENCLAW_BIN, configSetBatchFileArgs(path));
    },
    warn,
  );
}

/**
 * Apply one `openclaw config unset <path>`.
 *
 * @param runner - Command runner.
 * @param path - Config dot path.
 */
export async function applyConfigUnset(
  runner: CommandRunner,
  path: string,
): Promise<void> {
  await runChecked(runner, OPENCLAW_BIN, configUnsetArgs(path));
}
