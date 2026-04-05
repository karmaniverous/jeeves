/**
 * Resolve the package root directory from a module's `import.meta.url`.
 *
 * @module
 */

import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';

/**
 * Get the nearest package root directory relative to the calling module URL.
 *
 * @param importMetaUrl - The `import.meta.url` of the calling module.
 * @returns The absolute package root path, or `undefined` on any error.
 */
export function getPackageRoot(importMetaUrl: string): string | undefined {
  try {
    return packageDirectorySync({ cwd: fileURLToPath(importMetaUrl) });
  } catch {
    return undefined;
  }
}
