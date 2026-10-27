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

import { dtsDependencyGuardPlugin } from './rollup-plugin-dts-deps.js';
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

/**
 * Common input options for library builds.
 * Externalize runtime dependencies and peers.
 */
const commonInputOptions: InputOptions = {
  input: 'src/index.ts',
  external: [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    'tslib',
  ],
  plugins: [aliasPlugin({ entries: commonAliases }), ...commonPlugins],
};

/**
 * Library entry points (spec 5.1): output name (under `dist/`) to source,
 * plus the optional peers each entry point's declarations may import. The
 * root and `catalog` entry points may import none, so consumers that don't
 * adopt the catalog never need Fastify or the OpenAPI libraries.
 */
const libraryEntries = {
  index: { input: 'src/index.ts', optionalPeers: [] },
  'catalog/index': { input: 'src/catalog/index.ts', optionalPeers: [] },
  'openapi/index': {
    input: 'src/openapi/index.ts',
    optionalPeers: ['zod-openapi'],
  },
  'fastify/index': {
    input: 'src/fastify/index.ts',
    optionalPeers: ['fastify', 'fastify-type-provider-zod'],
  },
} satisfies Record<string, { input: string; optionalPeers: string[] }>;

/** Discover CLI commands under src/cli. */
const cliCommands = (await fs.readdir('src/cli').catch(() => [])) as string[];

/**
 * Build the library (ESM only): one bundle per entry point, with modules
 * shared between entry points emitted once under `chunks/`.
 */
export const buildLibrary = (dest: string): RollupOptions => ({
  ...commonInputOptions,
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
 * Build one bundled .d.ts per entry point at dest/<name>.d.ts, each guarded
 * against importing undeclared packages or optional peers it may not use.
 */
export const buildTypes = (dest: string): RollupOptions[] =>
  Object.entries(libraryEntries).map(([name, { input, optionalPeers }]) => ({
    input,
    output: [{ file: `${dest}/${name}.d.ts`, format: 'esm' }],
    plugins: [
      dtsPlugin(),
      dtsDependencyGuardPlugin(pkg, { allowOptionalPeers: optionalPeers }),
    ],
  }));

/** Assemble complete config: library, types, and CLI outputs. */
const config: RollupOptions[] = [
  // Library output (ESM)
  buildLibrary(outputPath),

  // Type definitions output (one .d.ts per entry point)
  ...buildTypes(outputPath),

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
