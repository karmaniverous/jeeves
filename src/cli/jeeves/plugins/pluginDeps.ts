/**
 * Production wiring of the plugin workflow ports (process spawner, node fs,
 * OpenClaw config dir, console logger).
 *
 * @module
 */

import { spawnCommandRunner } from './commandRunner.js';
import { nodeLegacyFs, resolveOpenClawConfigDir } from './legacyExtensions.js';
import type { PluginWorkflowDeps } from './workflows.js';

/**
 * Create workflow dependencies for a CLI invocation.
 *
 * @param dryRun - Print only; mutate nothing.
 * @returns Production dependencies.
 */
export function createPluginWorkflowDeps(dryRun: boolean): PluginWorkflowDeps {
  return {
    runner: spawnCommandRunner,
    fs: nodeLegacyFs,
    configDir: resolveOpenClawConfigDir(),
    log: (line) => {
      console.log(line);
    },
    dryRun,
  };
}

/** Reminder printed after live plugin changes. */
export const RESTART_NOTICE =
  'Plugin changes take effect on the next OpenClaw gateway start. Restart the gateway when convenient.';
