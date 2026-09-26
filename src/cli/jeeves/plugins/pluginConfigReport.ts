/**
 * Human-readable lines for resolved plugin config (dry run and live), with
 * secret values redacted, plus the warnings and restart notice printed at the
 * end of `jeeves install`/`jeeves update`. Pure.
 *
 * @module
 */

import type { PluginConfigResolution } from './pluginConfigResolve.js';
import { REDACTED } from './secrets.js';

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
  const server = resolution.serverKeyWrite;
  if (server) {
    lines.push(
      `  jeeves-server keys._plugin = ${REDACTED} (${server.path}; ${server.expect.kind === 'absent' ? 'currently unset' : 'replace'}; write)`,
    );
  }
  for (const warning of resolution.warnings ?? []) {
    lines.push(`  warning: ${warning}`);
  }
  for (const id of resolution.unknownPluginIds) {
    lines.push(`  ${id}: no known config schema; config left unchanged`);
  }
  return lines.length > 0 ? ['Plugin config:', ...lines] : [];
}

/**
 * Notices for the end of an install/update: every warning again, and after
 * a live run that wrote the server config, the jeeves-server restart notice.
 *
 * @param resolution - Resolved config.
 * @param dryRun - Whether nothing was changed.
 * @returns Notice lines (never containing a secret).
 */
export function pluginConfigNotices(
  resolution: PluginConfigResolution,
  dryRun: boolean,
): string[] {
  const notices = (resolution.warnings ?? []).map((w) => `Warning: ${w}`);
  const write = resolution.serverKeyWrite;
  if (write && !dryRun) {
    notices.push(
      `Updated keys._plugin in ${write.path} (value not shown). Restart jeeves-server to apply it.`,
    );
  }
  return notices;
}
