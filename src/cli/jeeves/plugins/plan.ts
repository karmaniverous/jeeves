/**
 * Plugin operation plans: pure step builders (descriptions live in
 * `describeStep.ts`, execution in `executePlan.ts`).
 *
 * @remarks
 * A plan is computed from read-only state (config slice, resolved versions,
 * install records, declared hooks, legacy directories) and then either
 * printed (`--dry-run`) or executed by {@link executePlan}. Step order encodes
 * the safety rules: legacy copies are removed only after the npm install
 * succeeded; a plugin's config is written before its install (a running
 * gateway activates it at once); config repair runs only after uninstall
 * succeeded. Config writes
 * are `configSetBatch` steps, run as `openclaw config set --batch-file` with an
 * owner-only temp file, so no value (secret or not) is on a command line.
 *
 * @module
 */

import {
  computeHookAccessOps,
  configValuePath,
  type PluginsConfig,
} from './configPatch.js';
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

/** A config batch step (secrets attached for redaction when present). */
const configBatch = (
  ops: ConfigSetOperation[],
  secrets: readonly string[],
): PlanStep => ({
  kind: 'configSetBatch',
  ops,
  ...(secrets.length > 0 ? { redact: [...secrets] } : {}),
});

/**
 * Split resolved config ops into per-plugin groups for the given plugin ids
 * and the rest.
 *
 * @param ops - Resolved `plugins.entries.<id>.config.<key>` operations.
 * @param pluginIds - Plugins whose config is written before their install.
 * @returns Ops by plugin id, and the ops not claimed by any of them.
 */
function splitConfigOps(
  ops: readonly ConfigSetOperation[],
  pluginIds: readonly string[],
): { byPlugin: Map<string, ConfigSetOperation[]>; rest: ConfigSetOperation[] } {
  const byPlugin = new Map<string, ConfigSetOperation[]>();
  const rest: ConfigSetOperation[] = [];
  for (const op of ops) {
    const owner = pluginIds.find((id) =>
      op.path.startsWith(configValuePath(id, '')),
    );
    if (owner === undefined) rest.push(op);
    else byPlugin.set(owner, [...(byPlugin.get(owner) ?? []), op]);
  }
  return { byPlugin, rest };
}

/**
 * Build the install/update plan.
 *
 * @param targets - Resolved targets.
 * @param plugins - Current `plugins` config slice.
 * @param config - Resolved plugin config to write (optional).
 * @returns The server `keys._plugin` write (if planned; first, so a failure
 *   there, e.g. a held lock, leaves OpenClaw untouched); then, per target not
 *   yet installed at its version: a config batch with that plugin's resolved
 *   `plugins.entries.<id>.config` values (when any need writing), the
 *   `openclaw plugins install`, and a migration sweep. A running gateway
 *   activates each plugin as soon as it is installed and plugins read their
 *   config (e.g. `configRoot`) at registration, so the config must already
 *   be there; it also overrides manifest defaults (e.g. the watcher's
 *   `configRoot`). Then legacy removals, then one final batch (preceded by
 *   a sweep when nothing was installed) with hook access (only for targets
 *   that declare conversation hooks; OpenClaw checks the installed package)
 *   and the config of already installed targets. Re-running after a later
 *   failure converges: the server then has the key and the plugin side
 *   copies it.
 */
export function buildInstallPlan(
  targets: readonly ResolvedTarget[],
  plugins: PluginsConfig,
  config?: PluginConfigResolution,
): PlanStep[] {
  const steps: PlanStep[] = config?.serverKeyWrite
    ? [{ kind: 'serverKeyWrite', write: config.serverKeyWrite }]
    : [];
  const secrets = config?.secrets ?? [];
  const toInstall = targets.filter((t) => t.installed !== true);
  const { byPlugin, rest } = splitConfigOps(
    config?.ops ?? [],
    toInstall.map((t) => t.pluginId),
  );
  for (const t of toInstall) {
    const ops = byPlugin.get(t.pluginId);
    if (ops) steps.push(configBatch(ops, secrets));
    steps.push(openclaw(pluginInstallArgs(t.packageName, t.version)));
    steps.push({ kind: 'migrationSweep' });
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
    ...rest,
  ];
  if (ops.length > 0) {
    if (toInstall.length === 0) steps.push({ kind: 'migrationSweep' });
    steps.push(configBatch(ops, secrets));
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
