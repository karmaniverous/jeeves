import { createRequire } from 'node:module';

import aliasPlugin, { type Alias } from '@rollup/plugin-alias';
import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replacePlugin from '@rollup/plugin-replace';
import typescriptPlugin from '@rollup/plugin-typescript';
import fs from 'fs-extra';
import type { InputOptions, RollupOptions } from 'rollup';
import dtsPlugin from 'rollup-plugin-dts';

import { libraryEntries } from './entry-points.js';
import {
  entryDependencyGuardPlugin,
  externalMatcher,
} from './rollup-plugin-entry-deps.js';
import { mdPlugin } from './rollup-plugin-md.js';

const require = createRequire(import.meta.url);
type Package = Record<string, Record<string, string> | undefined>;
const pkg = require('./package.json') as Package;

const outputPath = `dist`;

// Rollup writes bundle outputs; the TS plugin should only transpile.
// - outputToFilesystem=false avoids outDir/dir validation errors for multi-output builds.
// - incremental=false avoids TS build-info state referencing transient Rollup config artifacts.
// The --configPlugin instance that loads this file (rollup-config-plugin.mjs)
// sets outputToFilesystem explicitly too.
const typescript = typescriptPlugin({
  tsconfig: './tsconfig.json',
  outputToFilesystem: false,
  // Only compile bundled sources; prevents transient Rollup config artifacts
  // (e.g. rollup.config-*.mjs) from being pulled into the TS program.
  include: ['src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],

  // Override repo tsconfig settings for bundling.
  noEmit: false,
  declaration: false,
  declarationMap: false,
  incremental: false,
  allowJs: false,
  checkJs: false,
});

const commonPlugins = [
  replacePlugin({
    __JEEVES_CORE_VERSION__: (pkg as unknown as { version: string }).version,
    preventAssignment: true,
  }),
  commonjsPlugin({ esmExternals: ['commander'] }),
  jsonPlugin(),
  mdPlugin(),
  nodeResolve(),
  typescript,
];

const commonAliases: Alias[] = [];

/** Plugins every library and CLI build runs. */
const inputPlugins = [
  aliasPlugin({ entries: commonAliases }),
  ...commonPlugins,
];

/**
 * Common input options for library builds.
 * Externalize runtime dependencies and peers, including their subpaths.
 */
const commonInputOptions: InputOptions = {
  input: 'src/index.ts',
  external: externalMatcher([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    'tslib',
  ]),
  plugins: inputPlugins,
};

/** Guard each entry point's imports against undeclared or scoped packages. */
const entryGuard = () =>
  entryDependencyGuardPlugin(
    pkg,
    Object.fromEntries(
      Object.entries(libraryEntries).map(([name, { scoped }]) => [
        name,
        scoped,
      ]),
    ),
  );

/** Discover CLI commands under src/cli. */
const cliCommands = (await fs.readdir('src/cli').catch(() => [])) as string[];

/**
 * Build the library (ESM only): one bundle per entry point, with modules
 * shared between entry points emitted once under `chunks/`.
 */
export const buildLibrary = (dest: string): RollupOptions => ({
  ...commonInputOptions,
  plugins: [...inputPlugins, entryGuard()],
  input: Object.fromEntries(
    Object.entries(libraryEntries).map(([name, { input }]) => [name, input]),
  ),
  output: [
    {
      dir: dest,
      extend: true,
      format: 'esm',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
    },
  ],
});

/**
 * Build the declarations in one run: dest/<name>.d.ts per entry point, with
 * types shared between entry points emitted once under `chunks/`, so a
 * value from one entry point (e.g. a `Catalog`) type-checks in another's
 * API. Each entry point, with the chunks it imports, is guarded against
 * importing undeclared packages or scoped dependencies it may not use.
 */
export const buildTypes = (dest: string): RollupOptions => ({
  input: Object.fromEntries(
    Object.entries(libraryEntries).map(([name, { input }]) => [name, input]),
  ),
  output: [
    {
      dir: dest,
      format: 'esm',
      entryFileNames: '[name].d.ts',
      chunkFileNames: 'chunks/[name]-[hash].d.ts',
    },
  ],
  plugins: [dtsPlugin(), entryGuard()],
});

/** Assemble complete config: library, types, and CLI outputs. */
const config: RollupOptions[] = [
  // Library output (ESM)
  buildLibrary(outputPath),

  // Type definitions output (one .d.ts per entry point, shared chunks)
  buildTypes(outputPath),

  // CLI output.
  ...cliCommands.map<RollupOptions>((c) => ({
    ...commonInputOptions,
    input: `src/cli/${c}/index.ts`,
    output: [
      {
        dir: `${outputPath}/cli/${c}`,
        extend: true,
        format: 'esm',
        banner: '#!/usr/bin/env node',
      },
    ],
  })),
];

export default config;
