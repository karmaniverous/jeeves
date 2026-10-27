/**
 * Plugin resolution helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Provides workspace path resolution and plugin setting resolution
 * with a standard three-step fallback chain:
 * plugin config → environment variable → default value.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import type { PluginApi, PluginContext } from './types.js';

/** Whether the "workspace not configured" warning has been logged. */
let warnedUnconfigured = false;

/**
 * Expand a leading `~` to the home directory.
 *
 * @param path - Path.
 * @returns The expanded path.
 */
function expandHome(path: string): string {
  return path === '~' || /^~[/\\]/.test(path)
    ? join(homedir(), path.slice(1))
    : path;
}

/**
 * OpenClaw's default workspace for this process: `<state dir>/workspace`,
 * where the state dir is `OPENCLAW_STATE_DIR`, else `~/.openclaw-<profile>`
 * for a non-default `OPENCLAW_PROFILE`, else `~/.openclaw`.
 *
 * @returns The default workspace path.
 */
function defaultWorkspace(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateDir) return join(expandHome(stateDir), 'workspace');
  const profile = process.env.OPENCLAW_PROFILE?.trim();
  return join(
    homedir(),
    profile && profile !== 'default' ? `.openclaw-${profile}` : '.openclaw',
    'workspace',
  );
}

/**
 * Resolve the agent workspace directory.
 *
 * @remarks
 * In order (spec 5.8, #138):
 * 1. `agents.defaults.workspace` from the OpenClaw config, `~` expanded;
 * 2. `ctx.workspaceDir` from a hook or tool-factory context;
 * 3. OpenClaw's default workspace (see the state-dir rules), logging one
 *    `api.logger.warn` per process that the workspace isn't configured.
 *
 * Never returns the plugin root (`api.resolvePath` resolves against it) and
 * never throws.
 *
 * @param api - The plugin API object provided by the gateway.
 * @param ctx - Hook or tool-factory context, when available.
 * @returns Absolute path to the workspace.
 */
export function resolveWorkspacePath(
  api: PluginApi,
  ctx?: PluginContext,
): string {
  const configured = api.config?.agents?.defaults?.workspace;
  if (typeof configured === 'string' && configured.trim())
    return expandHome(configured.trim());

  const fromContext = ctx?.workspaceDir;
  if (typeof fromContext === 'string' && fromContext.trim()) return fromContext;

  const dir = defaultWorkspace();
  if (!warnedUnconfigured) {
    warnedUnconfigured = true;
    try {
      api.logger?.warn(`workspace not configured; using ${dir}`);
    } catch {
      // A failing host logger must not break path resolution.
    }
  }
  return dir;
}

/**
 * Resolve a plugin setting via the standard three-step fallback chain:
 * plugin config → environment variable → fallback value.
 *
 * @param api - Plugin API object.
 * @param pluginId - Plugin identifier (e.g., 'jeeves-watcher-openclaw').
 * @param key - Config key within the plugin's config object.
 * @param envVar - Environment variable name.
 * @param fallback - Default value if neither source provides one.
 * @returns The resolved setting value.
 */
export function resolvePluginSetting(
  api: PluginApi,
  pluginId: string,
  key: string,
  envVar: string,
  fallback: string,
): string {
  const fromPlugin = api.config?.plugins?.entries?.[pluginId]?.config?.[key];
  if (typeof fromPlugin === 'string') return fromPlugin;

  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  return fallback;
}

/**
 * Resolve an optional plugin setting via the two-step fallback chain:
 * plugin config → environment variable. Returns `undefined` if neither
 * source provides a value.
 *
 * @param api - Plugin API object.
 * @param pluginId - Plugin identifier (e.g., 'jeeves-watcher-openclaw').
 * @param key - Config key within the plugin's config object.
 * @param envVar - Environment variable name.
 * @returns The resolved setting value, or `undefined`.
 */
export function resolveOptionalPluginSetting(
  api: PluginApi,
  pluginId: string,
  key: string,
  envVar: string,
): string | undefined {
  const fromPlugin = api.config?.plugins?.entries?.[pluginId]?.config?.[key];
  if (typeof fromPlugin === 'string') return fromPlugin;

  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  return undefined;
}
