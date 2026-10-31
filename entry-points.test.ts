import { describe, expect, it } from 'vitest';

import { libraryEntries, scopedPackages } from './entry-points.js';
import pkg from './package.json' with { type: 'json' };

describe('libraryEntries', () => {
  it('scopes exactly Fastify and the OpenAPI library (spec Decision 89)', () => {
    expect([...scopedPackages].sort()).toEqual(['fastify', 'zod-openapi']);
  });

  it('scopes only optional peers, never regular dependencies', () => {
    for (const name of scopedPackages) {
      expect(Object.keys(pkg.peerDependencies)).toContain(name);
      expect(
        pkg.peerDependenciesMeta[name as keyof typeof pkg.peerDependenciesMeta]
          .optional,
      ).toBe(true);
      expect(Object.keys(pkg.dependencies)).not.toContain(name);
    }
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
