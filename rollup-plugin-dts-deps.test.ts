import type { OutputBundle, PluginContext } from 'rollup';
import { describe, expect, it, vi } from 'vitest';

import pkg from './package.json' with { type: 'json' };
import {
  collectBundleImports,
  dtsDependencyGuardPlugin,
  findUndeclaredTypeImports,
  packageNameOf,
} from './rollup-plugin-dts-deps.js';

const bundleOf = (imports: string[], dynamicImports: string[] = []) =>
  ({
    'index.d.ts': { type: 'chunk', imports, dynamicImports },
    'asset.txt': { type: 'asset' },
  }) as unknown as OutputBundle;

describe('packageNameOf', () => {
  it.each([
    ['zod', 'zod'],
    ['zod/v4', 'zod'],
    ['@commander-js/extra-typings', '@commander-js/extra-typings'],
    ['@scope/pkg/sub/path', '@scope/pkg'],
  ])('%s -> %s', (specifier, expected) => {
    expect(packageNameOf(specifier)).toBe(expected);
  });
});

describe('findUndeclaredTypeImports', () => {
  const declared = {
    dependencies: { zod: '^4' },
    peerDependencies: { commander: '^15' },
  };

  it('ignores relative, absolute, and node builtin specifiers', () => {
    expect(
      findUndeclaredTypeImports(
        ['./a.js', '../b.js', '/abs', 'node:fs', 'path', 'zod/v4', 'commander'],
        declared,
      ),
    ).toEqual([]);
  });

  it('reports undeclared packages, sorted and de-duplicated', () => {
    expect(
      findUndeclaredTypeImports(['zz', '@a/b/c', 'zz/sub', '@a/b'], declared),
    ).toEqual(['@a/b', 'zz']);
  });

  it('treats missing dependency maps as empty', () => {
    expect(findUndeclaredTypeImports(['zod'], {})).toEqual(['zod']);
  });

  it('passes for the real package.json and its type-level imports', () => {
    expect(
      findUndeclaredTypeImports(['@commander-js/extra-typings', 'zod'], pkg),
    ).toEqual([]);
  });
});

describe('collectBundleImports', () => {
  it('collects static and dynamic imports from chunks only', () => {
    expect(collectBundleImports(bundleOf(['a'], ['b']))).toEqual(['a', 'b']);
  });
});

describe('dtsDependencyGuardPlugin', () => {
  const run = (bundle: OutputBundle) => {
    const error = vi.fn();
    const plugin = dtsDependencyGuardPlugin({ dependencies: { zod: '^4' } });
    const hook = plugin.generateBundle as (
      this: PluginContext,
      options: unknown,
      bundle: OutputBundle,
    ) => void;
    hook.call({ error } as unknown as PluginContext, {}, bundle);
    return error;
  };

  it('does nothing when all type imports are declared', () => {
    expect(run(bundleOf(['zod']))).not.toHaveBeenCalled();
  });

  it('fails the build on undeclared type imports', () => {
    const error = run(bundleOf(['zod', '@commander-js/extra-typings']));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('@commander-js/extra-typings'),
    );
  });
});
