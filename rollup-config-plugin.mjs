/**
 * Rollup `--configPlugin` that transpiles `rollup.config.ts` (see the
 * `build` script).
 *
 * @remarks
 * Sets `outputToFilesystem` explicitly, which silences the
 * "outputToFilesystem option is defaulting to true" notice the TypeScript
 * plugin prints while loading the config. Rollup's inline option syntax
 * (`--configPlugin "@rollup/plugin-typescript={...}"`) would do the same, but
 * knip reads the whole argument as a package name and reports it as an
 * unlisted dependency.
 */
import typescript from '@rollup/plugin-typescript';

export default () => typescript({ outputToFilesystem: false });
