/**
 * Shared CLI defaults and resolution for Jeeves CLI commands.
 *
 * @remarks
 * All root CLI commands share workspace/config-root resolution. Values follow
 * the shared precedence model: flags → env → jeeves.config.json → defaults.
 */

import { resolve } from 'node:path';

import {
  loadWorkspaceConfig,
  resolveConfigValue,
  type ResolvedValue,
  WORKSPACE_CONFIG_DEFAULTS,
} from '../../config/index.js';
import { init } from '../../init.js';

/** Default workspace path. */
export const DEFAULT_WORKSPACE = WORKSPACE_CONFIG_DEFAULTS.core.workspace;

/** Default config root path. */
export const DEFAULT_CONFIG_ROOT = WORKSPACE_CONFIG_DEFAULTS.core.configRoot;

/** Standard workspace options parsed from CLI. */
export interface WorkspaceOptions {
  /** Workspace root path. */
  workspace?: string;
  /** Platform config root path. */
  configRoot?: string;
}

/** Resolved shared CLI config with provenance. */
export interface ResolvedCliConfig {
  /** Core shared config. */
  core: {
    workspace: ResolvedValue<string>;
    configRoot: ResolvedValue<string>;
    gatewayUrl: ResolvedValue<string>;
  };
  /** Memory shared config. */
  memory: {
    budget: ResolvedValue<number>;
    warningThreshold: ResolvedValue<number>;
    staleDays: ResolvedValue<number>;
  };
}

/** Read a numeric env var or return undefined if missing, empty, or invalid. */
function readNumericEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve shared CLI config using flags, env, file, and defaults.
 *
 * @param opts - Parsed CLI workspace/config-root options.
 * @returns Resolved config tree with provenance on every leaf.
 */
export function resolveCliConfig(opts: WorkspaceOptions): ResolvedCliConfig {
  const workspaceSeed = resolveConfigValue(
    opts.workspace,
    process.env['JEEVES_WORKSPACE'],
    undefined,
    DEFAULT_WORKSPACE,
  );
  const fileConfig = loadWorkspaceConfig(workspaceSeed.value);

  return {
    core: {
      workspace: resolveConfigValue(
        opts.workspace,
        process.env['JEEVES_WORKSPACE'],
        fileConfig?.core?.workspace,
        DEFAULT_WORKSPACE,
      ),
      configRoot: resolveConfigValue(
        opts.configRoot,
        process.env['JEEVES_CONFIG_ROOT'],
        fileConfig?.core?.configRoot,
        DEFAULT_CONFIG_ROOT,
      ),
      gatewayUrl: resolveConfigValue(
        undefined,
        process.env['JEEVES_GATEWAY_URL'],
        fileConfig?.core?.gatewayUrl,
        WORKSPACE_CONFIG_DEFAULTS.core.gatewayUrl,
      ),
    },
    memory: {
      budget: resolveConfigValue(
        undefined,
        readNumericEnv('JEEVES_MEMORY_BUDGET'),
        fileConfig?.memory?.budget,
        WORKSPACE_CONFIG_DEFAULTS.memory.budget,
      ),
      warningThreshold: resolveConfigValue(
        undefined,
        readNumericEnv('JEEVES_MEMORY_WARNING_THRESHOLD'),
        fileConfig?.memory?.warningThreshold,
        WORKSPACE_CONFIG_DEFAULTS.memory.warningThreshold,
      ),
      staleDays: resolveConfigValue(
        undefined,
        readNumericEnv('JEEVES_MEMORY_STALE_DAYS'),
        fileConfig?.memory?.staleDays,
        WORKSPACE_CONFIG_DEFAULTS.memory.staleDays,
      ),
    },
  };
}

/**
 * Initialize core from standard CLI options after resolving shared defaults.
 *
 * @param opts - Parsed Commander options with workspace and configRoot.
 * @returns Resolved CLI config.
 */
export function initFromOptions(opts: WorkspaceOptions): ResolvedCliConfig {
  const resolved = resolveCliConfig(opts);
  init({
    workspacePath: resolve(resolved.core.workspace.value),
    configRoot: resolve(resolved.core.configRoot.value),
  });
  return resolved;
}
