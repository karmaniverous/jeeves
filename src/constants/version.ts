/**
 * Core library version, read from package.json at runtime.
 *
 * @remarks
 * Used for version-stamp convergence (Decision 21). The version stamp
 * on managed content reflects the actual published library version,
 * enabling higher-version writers to take precedence.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve package.json from the dist directory.
 *
 * Rollup flattens all source files into `dist/index.js`, so a static
 * relative path like `../../package.json` breaks when the bundle runs
 * from `dist/`. Instead, walk up from the current file until we find
 * a directory containing `package.json`.
 */
function findPackageJson(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    try {
      const require = createRequire(import.meta.url);
      require.resolve(candidate);
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    'Could not find package.json from ' + fileURLToPath(import.meta.url),
  );
}

const require = createRequire(import.meta.url);
const pkg = require(findPackageJson()) as { version: string };

/** The core library version from package.json. */
export const CORE_VERSION: string = pkg.version;
