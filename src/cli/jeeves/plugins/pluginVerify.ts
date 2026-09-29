/**
 * Verify that a plugin is installed and enabled at an exact version.
 *
 * @remarks
 * Reads `openclaw plugins list --json` (v2026.9.6: an object whose
 * `plugins` array has one entry per plugin with `id`, `version`,
 * `enabled` and `status`, from the persisted plugin registry; the command
 * skips the config guard and loads no plugin code). Used after an
 * install lost its gateway connection: the gateway usually finishes the
 * install anyway, and this check decides whether it did.
 *
 * @module
 */

import { z } from 'zod';

import { getErrorMessage } from '../../../utils.js';
import type { CommandRunner } from './commandRunner.js';
import { describeFailure } from './gatewayWait.js';
import { OPENCLAW_BIN, pluginsListArgs } from './openclawCommands.js';

const pluginsListSchema = z.looseObject({
  plugins: z.array(
    z.looseObject({
      id: z.string(),
      version: z.string().optional(),
      enabled: z.boolean().optional(),
      status: z.string().optional(),
    }),
  ),
});

/** `plugins list --json` output (only the fields used here). */
export type PluginsList = z.infer<typeof pluginsListSchema>;

/** Result of a check: verified, or what was observed instead. */
export type InstallCheck = { ok: true } | { ok: false; observed: string };

/**
 * Check a plugin in a `plugins list` result.
 *
 * @param list - Parsed list.
 * @param pluginId - Plugin id.
 * @param version - Expected exact version.
 * @returns Verified, or the observed state.
 */
export function checkInstalled(
  list: PluginsList,
  pluginId: string,
  version: string,
): InstallCheck {
  const entry = list.plugins.find((p) => p.id === pluginId);
  if (!entry) return { ok: false, observed: 'not installed' };
  if (entry.version !== version) {
    return {
      ok: false,
      observed: `installed at ${entry.version ?? 'an unknown version'}, expected ${version}`,
    };
  }
  if (entry.enabled !== true) {
    return {
      ok: false,
      observed: `installed at ${version} but not enabled (status: ${entry.status ?? 'unknown'})`,
    };
  }
  return { ok: true };
}

/** Parse list output; tolerates log lines before the JSON object. */
function parseListOutput(stdout: string): unknown {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('\n{');
    if (start < 0) throw new Error('no JSON object in output');
    return JSON.parse(text.slice(start + 1));
  }
}

/**
 * Read `openclaw plugins list --json` and check a plugin.
 *
 * @param runner - Command runner.
 * @param pluginId - Plugin id.
 * @param version - Expected exact version.
 * @returns Verified, or the observed state (including read failures).
 */
export async function verifyInstalled(
  runner: CommandRunner,
  pluginId: string,
  version: string,
): Promise<InstallCheck> {
  const args = pluginsListArgs();
  try {
    const result = await runner(OPENCLAW_BIN, args);
    if (result.exitCode !== 0) {
      return { ok: false, observed: describeFailure(args, result) };
    }
    const list = pluginsListSchema.parse(parseListOutput(result.stdout));
    return checkInstalled(list, pluginId, version);
  } catch (error) {
    return {
      ok: false,
      observed: `cannot read plugins list: ${getErrorMessage(error)}`,
    };
  }
}
