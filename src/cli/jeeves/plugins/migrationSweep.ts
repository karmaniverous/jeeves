/**
 * Let OpenClaw resolve pending plugin-migration records before config writes.
 *
 * @remarks
 * When the gateway starts with `plugins.entries` for plugins that are not yet
 * installed, OpenClaw records a pending (deferred) data/settings migration for
 * each. Installing the plugin does not clear that record, and
 * `openclaw config set` refuses to edit the plugin's retained config while it
 * exists. `config` commands never clear it either: OpenClaw v2026.9.6 runs the
 * startup state-migration preflight (`runDoctorConfigPreflight` with
 * `migrateState: true`, which resolves finished records through
 * `recordDeferredPluginMigrations`, see
 * `src/commands/doctor-config-preflight-plugin-migrations.ts:160`) from
 * `ensureConfigReady` (`src/cli/program/config-guard.ts:256-328`) for every
 * guarded command except `config`, `health`, `logs`, `sessions` and a few
 * others. `plugins list` skips the guard (`configGuard: "skip"`,
 * `src/cli/command-catalog.ts:570-577`); `plugins inspect` has no catalog
 * entry, so it takes the default `configGuard: "run"`
 * (`src/cli/command-path-policy.ts:14`) and sweeps.
 *
 * The sweep is best effort: a failure is logged and never fails the plan (the
 * config write that follows reports any real problem).
 *
 * @module
 */

import { describeExit, formatCommand } from './commandLine.js';
import type { CommandRunner } from './commandRunner.js';
import { OPENCLAW_BIN, pluginsInspectAllArgs } from './openclawCommands.js';

/** Dry-run/log description of the sweep. */
export const MIGRATION_SWEEP_LINE = `${formatCommand(OPENCLAW_BIN, pluginsInspectAllArgs())} (lets OpenClaw clear pending plugin migrations)`;

const warn = (log: (line: string) => void, reason: string): void => {
  log(`plugin migration sweep failed (continuing): ${reason}`);
};

/**
 * Run `openclaw plugins inspect --all --json` so OpenClaw's startup preflight
 * resolves pending plugin-migration records. Output is not echoed.
 *
 * @param runner - Command runner.
 * @param log - Line logger.
 */
export async function runMigrationSweep(
  runner: CommandRunner,
  log: (line: string) => void,
): Promise<void> {
  const args = pluginsInspectAllArgs();
  log(`$ ${MIGRATION_SWEEP_LINE}`);
  try {
    const result = await runner(OPENCLAW_BIN, args);
    if (result.exitCode !== 0) {
      warn(log, describeExit(OPENCLAW_BIN, args, result.exitCode));
    }
  } catch (error) {
    warn(log, String(error));
  }
}
