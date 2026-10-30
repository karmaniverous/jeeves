import { builtinModules } from 'node:module';

import type { OutputBundle, Plugin } from 'rollup';

/** Dependency maps from `package.json` relevant to published types. */
export interface DeclaredDependencies {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

/**
 * Reduce a module specifier to its npm package name.
 *
 * @param specifier - Bare module specifier (e.g. `@scope/pkg/sub`).
 * @returns The package name (e.g. `@scope/pkg`).
 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Find bare-module imports that consumers could not resolve from the
 * published package's declared runtime dependencies, or that this entry
 * point may not import.
 *
 * @remarks
 * An optional peer (`peerDependenciesMeta[name].optional`) counts as
 * declared only for an entry point that lists it in `allowed`: consumers of
 * any other entry point may not have it installed. A package in `scoped`
 * (a dependency only some entry points need, e.g. Fastify) likewise counts
 * only for an entry point that lists it in `allowed`, so importing another
 * entry point never loads it.
 *
 * @param imports - Module specifiers imported by the emitted output.
 * @param pkg - Declared `dependencies` / `peerDependencies` /
 *   `peerDependenciesMeta`.
 * @param allowed - Optional peers and scoped packages this entry point may
 *   import.
 * @param scoped - Dependencies only the entry points that allow them may
 *   import.
 * @returns Sorted, de-duplicated package names that are undeclared.
 */
export function findUndeclaredTypeImports(
  imports: Iterable<string>,
  pkg: DeclaredDependencies,
  allowed: readonly string[] = [],
  scoped: readonly string[] = [],
): string[] {
  const isRestricted = (name: string): boolean =>
    pkg.peerDependenciesMeta?.[name]?.optional === true ||
    scoped.includes(name);
  const declared = new Set(
    [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ].filter((name) => !isRestricted(name) || allowed.includes(name)),
  );
  const undeclared = new Set<string>();
  for (const specifier of imports) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    if (specifier.startsWith('node:')) continue;
    if (builtinModules.includes(specifier)) continue;
    const name = packageNameOf(specifier);
    if (!declared.has(name)) undeclared.add(name);
  }
  return [...undeclared].sort();
}

/**
 * Collect the external imports an entry chunk reaches: its own, and those
 * of every shared chunk it imports, transitively.
 *
 * @param bundle - Rollup output bundle.
 * @param fileName - The entry chunk's file name.
 * @returns External module ids, de-duplicated.
 */
export function collectEntryImports(
  bundle: OutputBundle,
  fileName: string,
): string[] {
  const seen = new Set<string>();
  const external = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = bundle[name];
    if (item.type !== 'chunk') return;
    for (const id of [...item.imports, ...item.dynamicImports]) {
      if (id in bundle) visit(id);
      else external.add(id);
    }
  };
  visit(fileName);
  return [...external];
}

/**
 * Rollup plugin (for the library and `.d.ts` builds) that fails the build
 * when an entry point's output, including the shared chunks it imports,
 * imports a package that is not a declared `dependency` or `peerDependency`
 * (e.g. a devDependency-only package, which nested consumer installs cannot
 * resolve), or an optional peer or scoped package that entry point is not
 * allowed to import.
 *
 * @param pkg - Declared dependencies from `package.json`.
 * @param entries - Optional peers and scoped packages each entry point may
 *   import, keyed by entry chunk name. Every package listed for any entry
 *   point is scoped; an entry chunk not listed may import none of them.
 * @returns Rollup plugin.
 */
export function dtsDependencyGuardPlugin(
  pkg: DeclaredDependencies,
  entries: Readonly<Record<string, readonly string[]>> = {},
): Plugin {
  const scoped = [...new Set(Object.values(entries).flat())];
  return {
    name: 'dts-dependency-guard',
    generateBundle(_options, bundle) {
      const problems = Object.values(bundle).flatMap((item) => {
        if (item.type !== 'chunk' || !item.isEntry) return [];
        const undeclared = findUndeclaredTypeImports(
          collectEntryImports(bundle, item.fileName),
          pkg,
          entries[item.name],
          scoped,
        );
        return undeclared.length > 0
          ? [`${item.name}: ${undeclared.join(', ')}`]
          : [];
      });
      if (problems.length > 0) {
        this.error(
          `Published output imports packages missing from dependencies/peerDependencies, or optional peers or scoped packages not allowed in that entry point: ${problems.join('; ')}`,
        );
      }
    },
  };
}
