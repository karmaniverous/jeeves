/**
 * Internal helpers for the plugin installer CLI.
 *
 * @module
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Derive a component name from a plugin ID.
 *
 * @remarks
 * Strips `jeeves-` prefix and `-openclaw` suffix.
 *
 * @param pluginId - The plugin identifier.
 * @returns Component short name.
 */
export function deriveComponentName(pluginId: string): string {
  return pluginId.replace(/^jeeves-/, '').replace(/-openclaw$/, '');
}

/**
 * Copy all files from source directory to destination, recursively.
 *
 * @param srcDir - Source directory.
 * @param destDir - Destination directory.
 */
export function copyDistFiles(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDistFiles(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Read and parse a JSON file, returning an empty object if not found.
 *
 * @param filePath - Path to the JSON file.
 * @returns Parsed object.
 */
export function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
