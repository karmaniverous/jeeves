/**
 * OpenClaw I/O for `jeeves skills`: read the `skills` config slice (tolerant
 * of "not set"), and apply a change via one `config set --batch-file` call
 * plus `config unset` calls.
 *
 * @remarks
 * Reading goes through `plugins/openclawState.ts`'s `readConfigSlice`, the
 * same reader `readPluginsConfig` uses.
 *
 * @module
 */

import { type CommandRunner, runChecked } from '../plugins/commandRunner.js';
import {
  BATCH_FILE_NAME,
  configBatchPayload,
  configSetBatchFileArgs,
  type ConfigSetOperation,
  configUnsetArgs,
  OPENCLAW_BIN,
} from '../plugins/openclawCommands.js';
import { readConfigSlice } from '../plugins/openclawState.js';
import {
  type PrivateTempFiles,
  withPrivateTempFile,
} from '../plugins/privateTempFile.js';
import { type SkillsConfig, skillsConfigSchema } from './skillsModel.js';

/**
 * Read the `skills` config slice via `openclaw config get skills --json`.
 *
 * @param runner - Command runner.
 * @returns The parsed slice (`{}` when unset).
 */
export const readSkillsConfig = (
  runner: CommandRunner,
): Promise<SkillsConfig> =>
  readConfigSlice(runner, 'skills', skillsConfigSchema);

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
