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
 * published package's declared runtime dependencies.
 *
 * @remarks
 * An optional peer (`peerDependenciesMeta[name].optional`) counts as
 * declared only for an entry point that lists it in `allowOptionalPeers`:
 * consumers of any other entry point may not have it installed.
 *
 * @param imports - Module specifiers imported by the emitted declarations.
 * @param pkg - Declared `dependencies` / `peerDependencies` /
 *   `peerDependenciesMeta`.
 * @param allowOptionalPeers - Optional peers this entry point may import.
 * @returns Sorted, de-duplicated package names that are undeclared.
 */
export function findUndeclaredTypeImports(
  imports: Iterable<string>,
  pkg: DeclaredDependencies,
  allowOptionalPeers: readonly string[] = [],
): string[] {
  const isOptional = (name: string): boolean =>
    pkg.peerDependenciesMeta?.[name]?.optional === true;
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter(
      (name) => !isOptional(name) || allowOptionalPeers.includes(name),
    ),
  ]);
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
 * Rollup plugin (for the `.d.ts` build) that fails the build when an entry
 * point's declarations, including the shared chunks it imports, import a
 * package that is not a declared `dependency` or `peerDependency` (e.g. a
 * devDependency-only package, which nested consumer installs cannot
 * resolve), or an optional peer that entry point is not allowed to import.
 *
 * @param pkg - Declared dependencies from `package.json`.
 * @param entries - Optional peers each entry point may import, keyed by
 *   entry chunk name; an entry chunk not listed may import none.
 * @returns Rollup plugin.
 */
export function dtsDependencyGuardPlugin(
  pkg: DeclaredDependencies,
  entries: Readonly<Record<string, readonly string[]>> = {},
): Plugin {
  return {
    name: 'dts-dependency-guard',
    generateBundle(_options, bundle) {
      const problems = Object.values(bundle).flatMap((item) => {
        if (item.type !== 'chunk' || !item.isEntry) return [];
        const undeclared = findUndeclaredTypeImports(
          collectEntryImports(bundle, item.fileName),
          pkg,
          entries[item.name],
        );
        return undeclared.length > 0
          ? [`${item.name}: ${undeclared.join(', ')}`]
          : [];
      });
      if (problems.length > 0) {
        this.error(
          `Published types import packages missing from dependencies/peerDependencies, or optional peers not allowed in that entry point: ${problems.join('; ')}`,
        );
      }
    },
  };
}
