/**
 * Core library version, inlined at build time.
 *
 * @remarks
 * The `__JEEVES_CORE_VERSION__` placeholder is replaced by
 * `@rollup/plugin-replace` during the build with the actual version
 * from `package.json`. This ensures the correct version survives
 * when consumers bundle core into their own dist (where runtime
 * `import.meta.url`-based resolution would find the wrong package.json).
 */

/** The core library version from package.json (inlined at build time). */
export const CORE_VERSION: string = '__JEEVES_CORE_VERSION__';
