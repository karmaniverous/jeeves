import { builtinModules } from 'node:module';

import type { OutputBundle, Plugin } from 'rollup';

/** Dependency maps from `package.json` relevant to published types. */
export interface DeclaredDependencies {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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
 * @param imports - Module specifiers imported by the emitted declarations.
 * @param pkg - Declared `dependencies` / `peerDependencies`.
 * @returns Sorted, de-duplicated package names that are undeclared.
 */
export function findUndeclaredTypeImports(
  imports: Iterable<string>,
  pkg: DeclaredDependencies,
): string[] {
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
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
 * Collect external imports from every chunk in a Rollup output bundle.
 *
 * @param bundle - Rollup output bundle.
 * @returns All imported module ids across chunks.
 */
export function collectBundleImports(bundle: OutputBundle): string[] {
  return Object.values(bundle).flatMap((item) =>
    item.type === 'chunk' ? [...item.imports, ...item.dynamicImports] : [],
  );
}

/**
 * Rollup plugin (for the `.d.ts` bundle) that fails the build when the
 * emitted declarations import a package that is not a declared
 * `dependency` or `peerDependency` (e.g. a devDependency-only package,
 * which nested consumer installs cannot resolve).
 *
 * @param pkg - Declared dependencies from `package.json`.
 * @returns Rollup plugin.
 */
export function dtsDependencyGuardPlugin(pkg: DeclaredDependencies): Plugin {
  return {
    name: 'dts-dependency-guard',
    generateBundle(_options, bundle) {
      const undeclared = findUndeclaredTypeImports(
        collectBundleImports(bundle),
        pkg,
      );
      if (undeclared.length > 0) {
        this.error(
          `Published types import packages missing from dependencies/peerDependencies: ${undeclared.join(', ')}`,
        );
      }
    },
  };
}
