/**
 * Library entry points (spec 5.1), shared by `rollup.config.ts` and the
 * packed-consumer check.
 *
 * @module
 */

/** One entry point: its source and the scoped dependencies it may import. */
export interface LibraryEntry {
  /** Source file. */
  input: string;
  /**
   * Optional peers only this entry point may import (code and declarations).
   * The root and `catalog` entry points import none, so they work without
   * Fastify or the OpenAPI library installed (spec 5a.1).
   */
  scoped: readonly string[];
}

/** Output name (under `dist/`, without extension) to entry point. */
export const libraryEntries = {
  index: { input: 'src/index.ts', scoped: [] },
  'catalog/index': { input: 'src/catalog/index.ts', scoped: [] },
  'openapi/index': { input: 'src/openapi/index.ts', scoped: ['zod-openapi'] },
  'fastify/index': {
    input: 'src/fastify/index.ts',
    scoped: ['fastify'],
  },
} as const satisfies Record<string, LibraryEntry>;

/** Every scoped package, de-duplicated. */
export const scopedPackages: readonly string[] = [
  ...new Set(Object.values(libraryEntries).flatMap((e) => e.scoped)),
];
