/**
 * Plugin operation plans: pure step builders (descriptions live in
 * `describeStep.ts`, execution in `executePlan.ts`).
 *
 * @remarks
 * A plan is computed from read-only state (config slice, resolved versions,
 * install records, declared hooks, legacy directories) and then either
 * printed (`--dry-run`) or executed by {@link executePlan}. Step order encodes
 * the safety rules: legacy copies are removed only after the npm install
 * succeeded; config repair runs only after uninstall succeeded. Config writes
 * are `configSetBatch` steps, run as `openclaw config set --batch-file` with an
 * owner-only temp file, so no value (secret or not) is on a command line.
 *
 * @module
 */

import { computeHookAccessOps, type PluginsConfig } from './configPatch.js';
import {
  type ConfigSetOperation,
  OPENCLAW_BIN,
  pluginInstallArgs,
  pluginUninstallArgs,
} from './openclawCommands.js';
import type { PluginConfigResolution } from './pluginConfigResolve.js';
import type { PluginTarget } from './pluginSpec.js';
import type { ServerKeyWrite } from './serverKeySync.js';

/** A plan step. */
export type PlanStep =
  | {
      kind: 'exec';
      command: string;
      args: string[];
    }
  | {
      kind: 'configSetBatch';
      ops: ConfigSetOperation[];
      /** Secret values to redact from logs and errors. */
      redact?: string[];
    }
  | {
      /** Let OpenClaw clear pending plugin migrations (best effort). */
      kind: 'migrationSweep';
    }
  | { kind: 'removeDir'; path: string }
  | { kind: 'serverKeyWrite'; write: ServerKeyWrite }
  | {
      kind: 'repairAfterUninstall';
      before: PluginsConfig;
      pluginIds: string[];
    };

/** A target with its exact version and what the plan must do for it. */
export interface ResolvedTarget extends PluginTarget {
  /** Exact version to install. */
  version: string;
  /** Legacy `extensions/<id>` copy to remove after install. */
  legacyDir?: string;
  /** Already installed from npm at `version`: skip `plugins install`. */
  installed?: boolean;
  /** Conversation hooks the package declares (non-empty: grant access). */
  conversationHooks: string[];
}

/** An installed plugin to uninstall. */
export interface UninstallTarget {
  /** OpenClaw plugin id. */
  pluginId: string;
  /** Legacy `extensions/<id>` copy to remove. */
  legacyDir?: string;
}

const openclaw = (args: string[]): PlanStep => ({
  kind: 'exec',
  command: OPENCLAW_BIN,
  args,
});

/**
 * Build the install/update plan.
 *
 * @param targets - Resolved targets.
 * @param plugins - Current `plugins` config slice.
 * @param config - Resolved plugin config to write (optional).
 * @returns The server `keys._plugin` write (if planned; first, so a failure
 *   there, e.g. a held lock, leaves OpenClaw untouched), then install steps
 *   (targets not yet installed at their version), then legacy removals, then
 *   (when there is config to write) a migration sweep so OpenClaw clears the
 *   pending migration records it keeps for freshly installed plugins, then
 *   one config batch with hook access (only for targets that declare
 *   conversation hooks) and plugin config. Re-running after a later failure
 *   converges: the server then has the key and the plugin side copies it.
 */
export function buildInstallPlan(
  targets: readonly ResolvedTarget[],
  plugins: PluginsConfig,
  config?: PluginConfigResolution,
): PlanStep[] {
  const steps: PlanStep[] = config?.serverKeyWrite
    ? [{ kind: 'serverKeyWrite', write: config.serverKeyWrite }]
    : [];
  for (const t of targets) {
    if (t.installed !== true) {
      steps.push(openclaw(pluginInstallArgs(t.packageName, t.version)));
    }
  }
  for (const t of targets) {
    if (t.legacyDir) steps.push({ kind: 'removeDir', path: t.legacyDir });
  }
  const ops = [
    ...computeHookAccessOps(
      plugins,
      targets
        .filter((t) => t.conversationHooks.length > 0)
        .map((t) => t.pluginId),
    ),
    ...(config?.ops ?? []),
  ];
  if (ops.length > 0) {
    const secrets = config?.secrets ?? [];
    steps.push({ kind: 'migrationSweep' });
    steps.push({
      kind: 'configSetBatch',
      ops,
      ...(secrets.length > 0 ? { redact: [...secrets] } : {}),
    });
  }
  return steps;
}

/**
 * Build the uninstall plan.
 *
 * @param targets - Installed plugins to remove.
 * @param before - `plugins` config slice captured before uninstall.
 * @returns Uninstall steps, legacy removals, then the S1 config repair.
 */
export function buildUninstallPlan(
  targets: readonly UninstallTarget[],
  before: PluginsConfig,
): PlanStep[] {
  if (targets.length === 0) return [];
  const steps: PlanStep[] = targets.map((t) =>
    openclaw(pluginUninstallArgs(t.pluginId)),
  );
  for (const t of targets) {
    if (t.legacyDir) steps.push({ kind: 'removeDir', path: t.legacyDir });
  }
  steps.push({
    kind: 'repairAfterUninstall',
    before,
    pluginIds: targets.map((t) => t.pluginId),
  });
  return steps;
}
