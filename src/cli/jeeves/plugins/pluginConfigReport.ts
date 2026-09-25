/**
 * Human-readable lines for resolved plugin config (dry run and live), with
 * secret values redacted. Pure.
 *
 * @module
 */

import type { PluginConfigResolution } from './pluginConfigResolve.js';
import { REDACTED } from './secrets.js';
import { serverConfigPath } from './serverPluginKey.js';

/**
 * Describe resolved plugin config.
 *
 * @param resolution - Resolved config.
 * @returns Lines such as
 *   `jeeves-server-openclaw.pluginKey = <redacted> (generated; write)`.
 */
export function describePluginConfig(
  resolution: PluginConfigResolution,
): string[] {
  const lines = resolution.values.map((v) => {
    const shown = v.secret ? REDACTED : JSON.stringify(v.value);
    return `  ${v.pluginId}.${v.key} = ${shown} (${v.source}; ${v.write ? 'write' : 'keep'})`;
  });
  for (const id of resolution.unknownPluginIds) {
    lines.push(`  ${id}: no known config schema; config left unchanged`);
  }
  return lines.length > 0 ? ['Plugin config:', ...lines] : [];
}

/**
 * Follow-up notices for generated secrets.
 *
 * @param resolution - Resolved config.
 * @returns One notice per generated server plugin key.
 */
export function generatedSecretNotices(
  resolution: PluginConfigResolution,
): string[] {
  return resolution.values
    .filter((v) => v.source === 'generated')
    .map((v) => {
      const root = resolution.values.find(
        (r) => r.pluginId === v.pluginId && r.key === 'configRoot',
      )?.value;
      const where =
        typeof root === 'string'
          ? serverConfigPath(root)
          : 'the jeeves-server config';
      return `Generated a new ${v.key} for ${v.pluginId} (not shown). jeeves-server must trust the same seed: set keys._plugin in ${where} to plugins.entries.${v.pluginId}.config.${v.key} from openclaw.json, then restart jeeves-server.`;
    });
}
