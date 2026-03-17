/**
 * Registry version cache for npm package update awareness.
 *
 * @remarks
 * Caches the latest npm registry version in a local JSON file
 * to avoid expensive `npm view` calls on every refresh cycle.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REGISTRY_CACHE_FILE } from '../constants/paths.js';

/** Shape of the registry cache file. */
interface RegistryCacheEntry {
  /** Latest version from npm registry. */
  version: string;
  /** ISO timestamp of the last check. */
  checkedAt: string;
}

/**
 * Check the npm registry for the latest version of a package.
 *
 * @param packageName - The npm package name (e.g., '\@karmaniverous/jeeves').
 * @param cacheDir - Directory to store the cache file.
 * @param ttlSeconds - Cache TTL in seconds (default 3600).
 * @returns The latest version string, or undefined if the check fails.
 */
export function checkRegistryVersion(
  packageName: string,
  cacheDir: string,
  ttlSeconds = 3600,
): string | undefined {
  const cachePath = join(cacheDir, REGISTRY_CACHE_FILE);

  // Check cache first
  if (existsSync(cachePath)) {
    try {
      const raw = readFileSync(cachePath, 'utf-8');
      const entry = JSON.parse(raw) as RegistryCacheEntry;
      const age = Date.now() - new Date(entry.checkedAt).getTime();
      if (age < ttlSeconds * 1000) {
        return entry.version;
      }
    } catch {
      // Cache corrupt — proceed with fresh check
    }
  }

  // Query npm registry
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!result) return undefined;

    // Write cache
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const entry: RegistryCacheEntry = {
      version: result,
      checkedAt: new Date().toISOString(),
    };
    writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');

    return result;
  } catch {
    return undefined;
  }
}
