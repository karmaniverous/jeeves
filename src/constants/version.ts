/**
 * Core library version, read from package.json at runtime.
 *
 * @remarks
 * Used for version-stamp convergence (Decision 21). The version stamp
 * on managed content reflects the actual published library version,
 * enabling higher-version writers to take precedence.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

/** The core library version from package.json. */
export const CORE_VERSION: string = pkg.version;
