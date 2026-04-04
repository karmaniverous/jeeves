/**
 * OpenClaw configuration helpers for plugin CLI installers.
 *
 * @remarks
 * Provides resolution of OpenClaw home directory and config file path,
 * plus idempotent config patching for plugin install/uninstall.
 */

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Resolve the OpenClaw home directory.
 *
 * @remarks
 * Resolution order:
 * 1. `OPENCLAW_CONFIG` env var → dirname of the config file path
 * 2. `OPENCLAW_HOME` env var → resolved path
 * 3. Default: `~/.openclaw`
 *
 * @returns Absolute path to the OpenClaw home directory.
 */
export function resolveOpenClawHome(): string {
  if (process.env.OPENCLAW_CONFIG) {
    return dirname(resolve(process.env.OPENCLAW_CONFIG));
  }
  if (process.env.OPENCLAW_HOME) {
    return resolve(process.env.OPENCLAW_HOME);
  }
  return join(homedir(), '.openclaw');
}

/**
 * Resolve the OpenClaw config file path.
 *
 * @remarks
 * If `OPENCLAW_CONFIG` is set, uses that directly.
 * Otherwise defaults to `{home}/openclaw.json`.
 *
 * @param home - The OpenClaw home directory.
 * @returns Absolute path to the config file.
 */
export function resolveConfigPath(home: string): string {
  if (process.env.OPENCLAW_CONFIG) {
    return resolve(process.env.OPENCLAW_CONFIG);
  }
  return join(home, 'openclaw.json');
}

/**
 * Patch an allowlist array: add or remove the plugin ID.
 *
 * @returns A log message if a change was made, or undefined.
 */
function patchAllowList(
  parent: Record<string, unknown>,
  key: string,
  label: string,
  pluginId: string,
  mode: 'add' | 'remove',
): string | undefined {
  if (mode === 'add') {
    if (!Array.isArray(parent[key])) {
      parent[key] = [pluginId];
      return `Created ${label} with "${pluginId}"`;
    }

    const list = parent[key] as string[];
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      return `Added "${pluginId}" to ${label}`;
    }
  } else {
    if (!Array.isArray(parent[key])) return undefined;

    const list = parent[key] as string[];
    const filtered = list.filter((id) => id !== pluginId);
    if (filtered.length !== list.length) {
      parent[key] = filtered;
      return `Removed "${pluginId}" from ${label}`;
    }
  }

  return undefined;
}

/** Options for writing a plugin install provenance record. */
export interface PluginInstallRecord {
  /** Absolute path to the extensions directory where the plugin was installed. */
  installPath: string;
  /** Plugin version string from package.json, if known. */
  version?: string;
  /** ISO timestamp of installation. Defaults to `new Date().toISOString()`. */
  installedAt?: string;
}

/**
 * Patch an OpenClaw config for plugin install or uninstall.
 *
 * @remarks
 * Manages `plugins.entries.{pluginId}`, `plugins.installs.{pluginId}`,
 * and `tools.alsoAllow`.
 * Idempotent: adding twice produces no duplicates; removing when absent
 * produces no errors.
 *
 * @param config - The parsed OpenClaw config object (mutated in place).
 * @param pluginId - The plugin identifier.
 * @param mode - Whether to add or remove the plugin.
 * @param installRecord - Install provenance record (required when mode is 'add').
 * @returns Array of log messages describing changes made.
 */
export function patchConfig(
  config: Record<string, unknown>,
  pluginId: string,
  mode: 'add' | 'remove',
  installRecord?: PluginInstallRecord,
): string[] {
  const messages: string[] = [];

  // Ensure plugins section
  if (!config.plugins || typeof config.plugins !== 'object') {
    config.plugins = {};
  }
  const plugins = config.plugins as Record<string, unknown>;

  // plugins.entries
  if (!plugins.entries || typeof plugins.entries !== 'object') {
    plugins.entries = {};
  }
  const entries = plugins.entries as Record<string, unknown>;

  if (mode === 'add') {
    if (!entries[pluginId]) {
      entries[pluginId] = { enabled: true };
      messages.push(`Added "${pluginId}" to plugins.entries`);
    }
  } else if (pluginId in entries) {
    Reflect.deleteProperty(entries, pluginId);
    messages.push(`Removed "${pluginId}" from plugins.entries`);
  }

  // plugins.installs
  if (!plugins.installs || typeof plugins.installs !== 'object') {
    plugins.installs = {};
  }
  const installs = plugins.installs as Record<string, unknown>;

  if (mode === 'add' && installRecord) {
    installs[pluginId] = {
      source: 'path',
      installPath: installRecord.installPath,
      version: installRecord.version,
      installedAt: installRecord.installedAt ?? new Date().toISOString(),
    };
    messages.push(`Wrote install record for "${pluginId}" to plugins.installs`);
  } else if (mode === 'remove' && pluginId in installs) {
    Reflect.deleteProperty(installs, pluginId);
    messages.push(
      `Removed install record for "${pluginId}" from plugins.installs`,
    );
  }

  // tools.alsoAllow
  if (!config.tools || typeof config.tools !== 'object') {
    config.tools = {};
  }
  const tools = config.tools as Record<string, unknown>;
  const toolAlsoAllow = patchAllowList(
    tools,
    'alsoAllow',
    'tools.alsoAllow',
    pluginId,
    mode,
  );
  if (toolAlsoAllow) messages.push(toolAlsoAllow);

  return messages;
}
