/**
 * Locate and remove legacy (v0.x installer) plugin copies under
 * `<openclaw config dir>/extensions/<id>`.
 *
 * @remarks
 * The v0.x `createPluginCli` copied each plugin into the extensions
 * directory. After a standard npm install OpenClaw keeps its files under
 * `<config dir>/npm/projects/…` and leaves the legacy copy behind (runbook
 * spike S1). The config dir mirrors OpenClaw's `resolveConfigDir`
 * (v2026.9.6 `src/infra/config-dir.ts`): `OPENCLAW_STATE_DIR`, else the
 * directory of `OPENCLAW_CONFIG_PATH`, else `~/.openclaw`. A directory is only
 * treated as legacy when its `package.json` names the expected package.
 *
 * @module
 */

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Filesystem port for legacy cleanup. */
export interface LegacyFs {
  /** Whether `path` is an existing directory. */
  isDirectory: (path: string) => boolean;
  /** `name` from `<dir>/package.json`, or undefined. */
  readPackageName: (dir: string) => string | undefined;
  /** Recursively remove a directory. */
  removeDir: (path: string) => void;
}

/** Expand a leading `~`. */
function expandHome(p: string, home: string): string {
  return p === '~' || p.startsWith('~/') || p.startsWith('~\\')
    ? join(home, p.slice(1))
    : p;
}

/**
 * Resolve OpenClaw's config directory (parent of `extensions/` and `npm/`).
 *
 * @param env - Environment.
 * @param home - Home directory.
 * @returns Absolute config directory.
 */
export function resolveOpenClawConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = osHomedir(),
): string {
  const stateDir = env['OPENCLAW_STATE_DIR']?.trim();
  if (stateDir) return resolve(expandHome(stateDir, home));
  const configPath = env['OPENCLAW_CONFIG_PATH']?.trim();
  if (configPath) return dirname(resolve(expandHome(configPath, home)));
  return join(home, '.openclaw');
}

/**
 * Legacy extension directory of a plugin.
 *
 * @param configDir - OpenClaw config directory.
 * @param pluginId - OpenClaw plugin id.
 * @returns `<configDir>/extensions/<pluginId>`.
 */
export const legacyExtensionDir = (
  configDir: string,
  pluginId: string,
): string => join(configDir, 'extensions', pluginId);

/**
 * Find the legacy copy of a plugin, if present.
 *
 * @param fs - Filesystem port.
 * @param configDir - OpenClaw config directory.
 * @param pluginId - OpenClaw plugin id.
 * @param packageName - Expected npm package name.
 * @returns The legacy directory, or undefined.
 */
export function findLegacyExtension(
  fs: LegacyFs,
  configDir: string,
  pluginId: string,
  packageName: string,
): string | undefined {
  const dir = legacyExtensionDir(configDir, pluginId);
  if (!fs.isDirectory(dir)) return undefined;
  return fs.readPackageName(dir) === packageName ? dir : undefined;
}

/** Node filesystem adapter. */
export const nodeLegacyFs: LegacyFs = {
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  readPackageName: (dir) => {
    try {
      const pkg: unknown = JSON.parse(
        readFileSync(join(dir, 'package.json'), 'utf-8'),
      );
      return typeof pkg === 'object' &&
        pkg !== null &&
        typeof (pkg as { name?: unknown }).name === 'string'
        ? (pkg as { name: string }).name
        : undefined;
    } catch {
      return undefined;
    }
  },
  removeDir: (path) => {
    rmSync(path, { recursive: true, force: true });
  },
};
