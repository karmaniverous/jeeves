import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  fastifyOnlyPackages,
  libraryEntries,
  scopedPackages,
} from './entry-points.js';
import pkg from './package.json' with { type: 'json' };

/**
 * The source file a relative import names (`./x.js` is `./x.ts`).
 *
 * @param from - The importing file.
 * @param spec - The relative specifier.
 * @returns The imported source file.
 */
function sourceOf(from: string, spec: string): string {
  const path = resolve(dirname(from), spec).replace(/\.js$/, '.ts');
  return existsSync(path) ? path : resolve(path, 'index.ts');
}

/**
 * Bare packages an entry point's source reaches at run time: value imports
 * and re-exports (type-only ones are erased), transitively through relative
 * modules. The built entry point reaches no more (bundling only drops code).
 *
 * @param file - The entry point's source file.
 * @returns Package specifiers.
 */
function runtimePackages(file: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.ES2022,
    );
    for (const node of source.statements) {
      const isImport = ts.isImportDeclaration(node);
      if (!isImport && !ts.isExportDeclaration(node)) continue;
      const typeOnly = isImport
        ? node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
        : node.isTypeOnly;
      const spec = node.moduleSpecifier;
      if (typeOnly || !spec || !ts.isStringLiteral(spec)) continue;
      if (spec.text.startsWith('.')) visit(sourceOf(path, spec.text));
      else packages.add(spec.text);
    }
  };
  visit(resolve(import.meta.dirname, file));
  return packages;
}

describe('libraryEntries', () => {
  it('scopes exactly Fastify and the OpenAPI library (spec Decision 89)', () => {
    expect([...scopedPackages].sort()).toEqual(['fastify', 'zod-openapi']);
  });

  it('declares fastify-type-provider-zod nowhere (core validates requests itself)', () => {
    for (const deps of [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
    ])
      expect(Object.keys(deps)).not.toContain('fastify-type-provider-zod');
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

  it('keeps @fastify/error a regular dependency only /fastify reaches', () => {
    expect(fastifyOnlyPackages).toEqual(['@fastify/error']);
    expect(Object.keys(pkg.dependencies)).toContain('@fastify/error');
    expect(runtimePackages(libraryEntries['fastify/index'].input)).toContain(
      '@fastify/error',
    );
    for (const name of ['index', 'catalog/index', 'openapi/index'] as const)
      for (const p of fastifyOnlyPackages)
        expect(runtimePackages(libraryEntries[name].input)).not.toContain(p);
  });

  it('has one entry point per package.json export', () => {
    const exported = Object.values(pkg.exports).map((e) =>
      e.import.replace(/^\.\/dist\/|\.js$/g, ''),
    );
    expect(Object.keys(libraryEntries).sort()).toEqual(exported.sort());
  });
});
