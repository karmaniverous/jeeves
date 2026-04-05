/**
 * Resolve the version of a package from its `import.meta.url`.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getPackageRoot } from './getPackageRoot.js';

/**
 * Get the version string from the nearest `package.json` relative to the
 * caller's module URL.
 *
 * @param importMetaUrl - The `import.meta.url` of the calling module.
 * @returns The `version` field, or `'unknown'` on any error.
 */
export function getPackageVersion(importMetaUrl: string): string {
  try {
    const pkgRoot = getPackageRoot(importMetaUrl);
    if (!pkgRoot) return 'unknown';
    const raw = readFileSync(join(pkgRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
