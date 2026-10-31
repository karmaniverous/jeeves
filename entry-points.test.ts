import { describe, expect, it } from 'vitest';

import { libraryEntries, scopedPackages } from './entry-points.js';
import pkg from './package.json' with { type: 'json' };

describe('libraryEntries', () => {
  it('scopes exactly the Fastify and OpenAPI libraries (spec Decision 88)', () => {
    expect([...scopedPackages].sort()).toEqual([
      'fastify',
      'fastify-type-provider-zod',
      'zod-openapi',
    ]);
  });

  it('scopes only declared dependencies', () => {
    for (const name of scopedPackages)
      expect(Object.keys(pkg.dependencies)).toContain(name);
  });

  it('lets the root and /catalog import no scoped package', () => {
    expect(libraryEntries.index.scoped).toEqual([]);
    expect(libraryEntries['catalog/index'].scoped).toEqual([]);
  });

  it('has one entry point per package.json export', () => {
    const exported = Object.values(pkg.exports).map((e) =>
      e.import.replace(/^\.\/dist\/|\.js$/g, ''),
    );
    expect(Object.keys(libraryEntries).sort()).toEqual(exported.sort());
  });
});
