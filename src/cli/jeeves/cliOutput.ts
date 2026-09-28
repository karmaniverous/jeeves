/**
 * Console output shared by the mutating jeeves commands (install, update,
 * uninstall): dry-run markers, the run header, end-of-run plugin notices and
 * the gateway restart reminder (only when a change was not applied live).
 * Pure strings plus a line printer.
 *
 * @module
 */

import { allAppliedLive, type ApplyReport } from './plugins/applyReport.js';
import { pluginConfigNotices } from './plugins/pluginConfigReport.js';
import type { PreparedInstall } from './plugins/workflows.js';

/** Reminder printed after plugin changes that were not applied live. */
export const RESTART_NOTICE =
  'Plugin changes take effect on the next OpenClaw gateway start. Restart the gateway when convenient.';

/**
 * What to say about the gateway after plugin changes: nothing when nothing
 * changed, a live-apply line when OpenClaw reported every change applied
 * live, else {@link RESTART_NOTICE}.
 *
 * @param report - Live-apply report of the run.
 * @returns Zero or one line.
 */
export function gatewayNotice(report: ApplyReport): string[] {
  if (report.changes === 0) return [];
  if (!allAppliedLive(report)) return [RESTART_NOTICE];
  const generation =
    report.generations.length > 0
      ? ` (gateway generation ${String(Math.max(...report.generations))})`
      : '';
  return [
    `Plugin changes were applied live by the running OpenClaw gateway${generation}; no restart needed.`,
  ];
}

/** Last line of every dry run. */
export const DRY_RUN_COMPLETE = 'Dry run complete. Nothing was changed.';

/**
 * Suffix marking a title line as a dry run.
 *
 * @param dryRun - Whether nothing will be changed.
 * @returns `' [dry run: no changes]'` or `''`.
 */
export const dryRunSuffix = (dryRun: boolean): string =>
  dryRun ? ' [dry run: no changes]' : '';

/**
 * Header of a workspace-level run: title, workspace, config root, blank line.
 *
 * @param title - e.g. `Jeeves platform install`.
 * @param core - Resolved workspace and config root.
 * @param dryRun - Whether nothing will be changed.
 * @returns Lines to print.
 */
export function runHeaderLines(
  title: string,
  core: { workspace: { value: string }; configRoot: { value: string } },
  dryRun: boolean,
): string[] {
  return [
    `${title}${dryRunSuffix(dryRun)}`,
    `  Workspace: ${core.workspace.value}`,
    `  Config root: ${core.configRoot.value}`,
    '',
  ];
}

/**
 * Plugin config notices for the end of an install/update (warnings, and the
 * jeeves-server restart notice after a live server config write).
 *
 * @param prepared - The prepared (and executed, unless dry run) install.
 * @param dryRun - Whether nothing was changed.
 * @returns Notice lines (never containing a secret).
 */
export const installNotices = (
  prepared: Pick<PreparedInstall, 'config'>,
  dryRun: boolean,
): string[] =>
  prepared.config ? pluginConfigNotices(prepared.config, dryRun) : [];

/**
 * Print lines to stdout.
 *
 * @param lines - Lines (an empty string prints a blank line).
 */
export function printLines(lines: readonly string[]): void {
  for (const line of lines) console.log(line);
}
