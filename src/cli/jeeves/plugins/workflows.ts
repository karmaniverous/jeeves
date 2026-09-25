/**
 * Plugin workflows for `jeeves install`, `jeeves update` and
 * `jeeves uninstall`: read state, build a plan, print or run it.
 *
 * @remarks
 * Reads go through the `openclaw`/`npm` CLIs (read-only, also under
 * `--dry-run`); every mutation is a plan step (see {@link buildInstallPlan},
 * {@link buildUninstallPlan}). Paths are built with `node:path` and processes
 * are spawned without a shell, so the same code runs on Windows and Linux.
 *
 * @module
 */

import { dryRunSuffix } from '../cliOutput.js';
import { configuredPluginIds } from './configPatch.js';
import { executePlan, type ExecutePlanContext } from './executePlan.js';
import { findLegacyExtension } from './legacyExtensions.js';
import {
  assertOpenClawAvailable,
  OpenClawNotFoundError,
  readPluginsConfig,
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
import { resolveTargets } from './resolveTargets.js';

/** Dependencies shared by all plugin workflows. */
export interface PluginWorkflowDeps extends ExecutePlanContext {
  /** OpenClaw config directory (parent of `extensions/`). */
  configDir: string;
}

/** Print the plan header and prerequisite version. */
async function preflight(deps: PluginWorkflowDeps, title: string) {
  const version = await assertOpenClawAvailable(deps.runner);
  deps.log(`${title} (${version})${dryRunSuffix(deps.dryRun)}`);
}

/** Options of an install/update. */
export interface InstallOptions {
  /** Plugin config to fill in (missing values) or set (explicit values). */
  configRequest?: PluginConfigRequest;
  /** Reinstall even when the exact version is already installed. */
  forceReinstall?: boolean;
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
 * read, target resolution (version, install record, declared hooks), plugin
 * config resolution, plan.
 *
 * @param deps - Workflow dependencies.
 * @param targets - Plugins to install (range resolved via npm).
 * @param options - Plugin config request and reinstall policy.
 * @returns The prepared install.
 * @throws MissingPluginConfigError before any mutation when required plugin
 *   config is missing.
 */
export async function prepareInstall(
  deps: PluginWorkflowDeps,
  targets: readonly PluginTarget[],
  options: InstallOptions = {},
): Promise<PreparedInstall> {
  if (targets.length === 0) return { resolved: [], plan: [] };
  await preflight(deps, 'Jeeves plugins');
  const plugins = await readPluginsConfig(deps.runner);
  const resolved = await resolveTargets(deps, targets, {
    ...(options.forceReinstall ? { forceReinstall: true } : {}),
  });
  const config = options.configRequest
    ? resolvePluginConfig(
        plugins,
        resolved.map((t) => t.pluginId),
        options.configRequest,
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
 * @param options - Plugin config request and reinstall policy.
 * @returns The prepared install (already executed unless dry run).
 */
export async function installPlugins(
  deps: PluginWorkflowDeps,
  targets: readonly PluginTarget[],
  options: InstallOptions = {},
): Promise<PreparedInstall> {
  const prepared = await prepareInstall(deps, targets, options);
  await executePlan(prepared.plan, deps);
  return prepared;
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
 * Uninstall every configured Jeeves plugin and repair the config afterwards.
 *
 * @param deps - Workflow dependencies.
 * @returns The plugin ids targeted (empty when OpenClaw is not installed or
 *   no Jeeves plugin is configured).
 */
export async function uninstallPlugins(
  deps: PluginWorkflowDeps,
): Promise<string[]> {
  try {
    await preflight(deps, 'Jeeves plugin removal');
  } catch (error) {
    if (!(error instanceof OpenClawNotFoundError)) throw error;
    deps.log('  OpenClaw CLI not found; no plugins to remove');
    return [];
  }
  const before = await readPluginsConfig(deps.runner);
  const ids = configuredPluginIds(before, isJeevesPluginId);
  if (ids.length === 0) {
    deps.log('  no Jeeves plugins configured; nothing to uninstall');
    return [];
  }
  const plan = buildUninstallPlan(
    ids.map((id) => {
      const t = parsePluginSpec(id);
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
  return ids;
}
