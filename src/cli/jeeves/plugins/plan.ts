/**
 * Plugin operation plans: pure step builders and their dry-run descriptions.
 *
 * @remarks
 * A plan is computed from read-only state (config slice, resolved versions,
 * legacy directories) and then either printed (`--dry-run`) or executed by
 * {@link executePlan}. Step order encodes the safety rules: legacy copies are
 * removed only after the npm install succeeded; config repair runs only after
 * uninstall succeeded.
 *
 * @module
 */

import { formatCommand } from './commandRunner.js';
import {
  computeHookAccessOps,
  entryPath,
  type PluginsConfig,
} from './configPatch.js';
import {
  configSetBatchArgs,
  configUnsetArgs,
  OPENCLAW_BIN,
  pluginInstallArgs,
  pluginUninstallArgs,
} from './openclawCommands.js';
import type { PluginConfigResolution } from './pluginConfigResolve.js';
import type { PluginTarget } from './pluginSpec.js';
import { redactSecrets } from './secrets.js';

/** A plan step. */
export type PlanStep =
  | {
      kind: 'exec';
      command: string;
      args: string[];
      /** Secret values to redact from logs and errors. */
      redact?: string[];
    }
  | { kind: 'removeDir'; path: string }
  | {
      kind: 'repairAfterUninstall';
      before: PluginsConfig;
      pluginIds: string[];
    };

/** A target with its exact version and optional legacy copy. */
export interface ResolvedTarget extends PluginTarget {
  /** Exact version to install. */
  version: string;
  /** Legacy `extensions/<id>` copy to remove after install. */
  legacyDir?: string;
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
 * @returns Install steps, then legacy removals, then one
 *   `config set --batch-json` with hook access and plugin config.
 */
export function buildInstallPlan(
  targets: readonly ResolvedTarget[],
  plugins: PluginsConfig,
  config?: PluginConfigResolution,
): PlanStep[] {
  const steps: PlanStep[] = targets.map((t) =>
    openclaw(pluginInstallArgs(t.packageName, t.version)),
  );
  for (const t of targets) {
    if (t.legacyDir) steps.push({ kind: 'removeDir', path: t.legacyDir });
  }
  const ops = [
    ...computeHookAccessOps(
      plugins,
      targets.map((t) => t.pluginId),
    ),
    ...(config?.ops ?? []),
  ];
  if (ops.length > 0) {
    const secrets = config?.secrets ?? [];
    steps.push({
      ...openclaw(configSetBatchArgs(ops)),
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

/**
 * Human-readable lines for one step (used for dry-run and live logs).
 *
 * @param step - Plan step.
 * @returns One or more lines; exec steps are exact command lines.
 */
export function describeStep(step: PlanStep): string[] {
  switch (step.kind) {
    case 'exec':
      return [
        redactSecrets(formatCommand(step.command, step.args), step.redact),
      ];
    case 'removeDir':
      return [`remove legacy plugin copy: ${step.path}`];
    case 'repairAfterUninstall': {
      const lines = step.pluginIds.map(
        (id) =>
          `if left as {"enabled":false}: ${formatCommand(OPENCLAW_BIN, configUnsetArgs(entryPath(id)))}`,
      );
      if (step.before.load !== undefined) {
        lines.push(
          `if plugins.load was removed: ${formatCommand(
            OPENCLAW_BIN,
            configSetBatchArgs([
              { path: 'plugins.load', value: step.before.load },
            ]),
          )}`,
        );
      }
      return lines;
    }
  }
}
