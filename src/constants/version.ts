/**
 * Core library version, read from package.json at runtime.
 *
 * @remarks
 * Used for version-stamp convergence (Decision 21). The version stamp
 * on managed content reflects the actual published library version,
 * enabling higher-version writers to take precedence.
 *
 * Uses `package-directory` to locate the package root regardless of
 * whether this code runs from `src/constants/` (dev) or `dist/` (bundled).
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';

const pkgDir = packageDirectorySync({ cwd: fileURLToPath(import.meta.url) });
if (!pkgDir) {
  throw new Error(
    'Could not find package root from ' + fileURLToPath(import.meta.url),
  );
}

const require = createRequire(import.meta.url);
const pkg = require(join(pkgDir, 'package.json')) as { version: string };

/** The core library version from package.json. */
export const CORE_VERSION: string = pkg.version;
