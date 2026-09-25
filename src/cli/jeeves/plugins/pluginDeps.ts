/**
 * Production wiring of the plugin workflow ports (process spawner, node fs,
 * owner-only temp files, OpenClaw config dir, console logger).
 *
 * @module
 */

import { spawnCommandRunner } from './commandRunner.js';
import { nodeLegacyFs, resolveOpenClawConfigDir } from './legacyExtensions.js';
import type { PluginConfigRequest } from './pluginConfigResolve.js';
import type { PluginConfigInput } from './pluginConfigSchema.js';
import { createNodePrivateTempFiles } from './privateTempFile.js';
import { generatePluginKey } from './secrets.js';
import { createServerConfigWriter } from './serverConfigWrite.js';
import { nodeReadTextFile, readServerKeyState } from './serverPluginKey.js';
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
    tempFiles: createNodePrivateTempFiles(spawnCommandRunner),
    serverConfig: createServerConfigWriter(),
    configDir: resolveOpenClawConfigDir(),
    log: (line) => {
      console.log(line);
    },
    dryRun,
  };
}

/**
 * Create the production plugin config request for `jeeves install` and
 * `jeeves update`.
 *
 * @param options - Values from CLI options.
 * @param file - Values from `--plugin-config`.
 * @param inheritedConfigRoot - configRoot from env / `jeeves.config.json`.
 * @returns The request (node fs reader, crypto secret generator).
 */
export function createPluginConfigRequest(
  options: PluginConfigInput,
  file: PluginConfigInput,
  inheritedConfigRoot?: string,
): PluginConfigRequest {
  return {
    options,
    file,
    ...(inheritedConfigRoot ? { inheritedConfigRoot } : {}),
    readServerKey: (root) => readServerKeyState(nodeReadTextFile, root),
    generateSecret: generatePluginKey,
  };
}

/** Reminder printed after live plugin changes. */
export const RESTART_NOTICE =
  'Plugin changes take effect on the next OpenClaw gateway start. Restart the gateway when convenient.';
