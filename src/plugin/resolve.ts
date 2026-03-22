/**
 * Plugin resolution helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Provides workspace path resolution and plugin setting resolution
 * with a standard three-step fallback chain:
 * plugin config → environment variable → default value.
 */

import type { PluginApi } from './types.js';

/**
 * Resolve the workspace root from the OpenClaw plugin API.
 *
 * @remarks
 * Tries three sources in order:
 * 1. `api.config.agents.defaults.workspace` — explicit config
 * 2. `api.resolvePath('.')` — gateway-provided path resolver
 * 3. `process.cwd()` — last resort
 *
 * @param api - The plugin API object provided by the gateway.
 * @returns Absolute path to the workspace root.
 */
export function resolveWorkspacePath(api: PluginApi): string {
  const configured = api.config?.agents?.defaults?.workspace;
  if (typeof configured === 'string' && configured.trim()) {
    return configured;
  }

  if (typeof api.resolvePath === 'function') {
    return api.resolvePath('.');
  }

  return process.cwd();
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
