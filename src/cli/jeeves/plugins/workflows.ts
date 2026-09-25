/**
 * Plugin workflows for `jeeves install`, `jeeves update` and
 * `jeeves uninstall --plugins`: read state, build a plan, print or run it.
 *
 * @remarks
 * Reads go through the `openclaw`/`npm` CLIs (read-only, also under
 * `--dry-run`); every mutation is a plan step (see {@link buildInstallPlan},
 * {@link buildUninstallPlan}). Paths are built with `node:path` and processes
 * are spawned without a shell, so the same code runs on Windows and Linux.
 *
 * @module
 */

import type { CommandRunner } from './commandRunner.js';
import { configuredPluginIds } from './configPatch.js';
import { executePlan } from './executePlan.js';
import { findLegacyExtension, type LegacyFs } from './legacyExtensions.js';
import {
  assertOpenClawAvailable,
  readPluginsConfig,
  resolveExactVersion,
} from './openclawState.js';
import {
  buildInstallPlan,
  buildUninstallPlan,
  type PlanStep,
  type ResolvedTarget,
} from './plan.js';
import { describePluginConfig } from './pluginConfigReport.js';
import {
  type PluginConfigRequest,
  type PluginConfigResolution,
  resolvePluginConfig,
} from './pluginConfigResolve.js';
import {
  isJeevesPluginId,
  parsePluginSpec,
  type PluginTarget,
} from './pluginSpec.js';

/** Dependencies shared by all plugin workflows. */
export interface PluginWorkflowDeps {
  /** Command runner port. */
  runner: CommandRunner;
  /** Filesystem port. */
  fs: LegacyFs;
  /** OpenClaw config directory (parent of `extensions/`). */
  configDir: string;
  /** Line logger. */
  log: (line: string) => void;
  /** Print only; mutate nothing. */
  dryRun: boolean;
}

/** Print the plan header and prerequisite version. */
async function preflight(deps: PluginWorkflowDeps, title: string) {
  const version = await assertOpenClawAvailable(deps.runner);
  deps.log(
    `${title} (${version})${deps.dryRun ? ' [dry run: no changes]' : ''}`,
  );
}

/** A computed, not yet executed, install/update. */
export interface PreparedInstall {
  /** Targets with exact versions. */
  resolved: ResolvedTarget[];
  /** Resolved plugin config (when requested). */
  config?: PluginConfigResolution;
  /** Plan to print or execute. */
  plan: PlanStep[];
}

/**
 * Compute an install/update without mutating anything: preflight, config
 * read, version resolution, plugin config resolution, plan.
 *
 * @param deps - Workflow dependencies.
 * @param targets - Plugins to install (range resolved via npm).
 * @param configRequest - Plugin config to write (`jeeves install` only).
 * @returns The prepared install.
 * @throws MissingPluginConfigError before any mutation when required plugin
 *   config is missing.
 */
export async function prepareInstall(
  deps: PluginWorkflowDeps,
  targets: readonly PluginTarget[],
  configRequest?: PluginConfigRequest,
): Promise<PreparedInstall> {
  if (targets.length === 0) return { resolved: [], plan: [] };
  await preflight(deps, 'Jeeves plugins');
  const plugins = await readPluginsConfig(deps.runner);
  const resolved: ResolvedTarget[] = [];
  for (const t of targets) {
    const version = await resolveExactVersion(
      deps.runner,
      t.packageName,
      t.range,
    );
    const legacyDir = findLegacyExtension(
      deps.fs,
      deps.configDir,
      t.pluginId,
      t.packageName,
    );
    resolved.push({ ...t, version, ...(legacyDir ? { legacyDir } : {}) });
    deps.log(
      `  ${t.packageName}@${version}${legacyDir ? ' (legacy copy found)' : ''}`,
    );
  }
  const config = configRequest
    ? resolvePluginConfig(
        plugins,
        resolved.map((t) => t.pluginId),
        configRequest,
      )
    : undefined;
  if (config) for (const line of describePluginConfig(config)) deps.log(line);
  return {
    resolved,
    ...(config ? { config } : {}),
    plan: buildInstallPlan(resolved, plugins, config),
  };
}

/**
 * Install or update Jeeves plugins (prepare, then print or execute).
 *
 * @param deps - Workflow dependencies.
 * @param targets - Plugins to install (range resolved via npm).
 * @param configRequest - Plugin config to write (`jeeves install` only).
 * @returns The resolved targets.
 */
export async function installPlugins(
  deps: PluginWorkflowDeps,
  targets: readonly PluginTarget[],
  configRequest?: PluginConfigRequest,
): Promise<ResolvedTarget[]> {
  const prepared = await prepareInstall(deps, targets, configRequest);
  await executePlan(prepared.plan, deps);
  return prepared.resolved;
}

/**
 * Targets for `jeeves update`: explicit specs, else every Jeeves plugin
 * with a `plugins.entries` record, at `latest`.
 *
 * @param deps - Workflow dependencies.
 * @param specs - User-supplied specs (may be empty).
 * @returns Targets to update.
 */
export async function selectUpdateTargets(
  deps: Pick<PluginWorkflowDeps, 'runner'>,
  specs: readonly PluginTarget[],
): Promise<PluginTarget[]> {
  if (specs.length > 0) return [...specs];
  const plugins = await readPluginsConfig(deps.runner);
  const ids = configuredPluginIds(plugins, isJeevesPluginId);
  if (ids.length === 0) {
    throw new Error(
      'No installed Jeeves plugins found in plugins.entries; pass packages explicitly.',
    );
  }
  return ids.map((id) => parsePluginSpec(id));
}

/**
 * Uninstall Jeeves plugins and repair the config afterwards.
 *
 * @param deps - Workflow dependencies.
 * @param specs - Plugins to remove; empty means every configured Jeeves plugin.
 * @returns The plugin ids targeted.
 */
export async function uninstallPlugins(
  deps: PluginWorkflowDeps,
  specs: readonly PluginTarget[],
): Promise<string[]> {
  await preflight(deps, 'Jeeves plugin removal');
  const before = await readPluginsConfig(deps.runner);
  const targets =
    specs.length > 0
      ? specs
      : configuredPluginIds(before, isJeevesPluginId).map((id) =>
          parsePluginSpec(id),
        );
  if (targets.length === 0) {
    deps.log('  no Jeeves plugins configured; nothing to uninstall');
    return [];
  }
  const plan = buildUninstallPlan(
    targets.map((t) => {
      const legacyDir = findLegacyExtension(
        deps.fs,
        deps.configDir,
        t.pluginId,
        t.packageName,
      );
      return { pluginId: t.pluginId, ...(legacyDir ? { legacyDir } : {}) };
    }),
    before,
  );
  await executePlan(plan, deps);
  return targets.map((t) => t.pluginId);
}
