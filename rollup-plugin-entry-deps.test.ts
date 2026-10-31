import type { OutputBundle, PluginContext } from 'rollup';
import { describe, expect, it, vi } from 'vitest';

import pkg from './package.json' with { type: 'json' };
import {
  collectEntryImports,
  entryDependencyGuardPlugin,
  externalMatcher,
  findUndeclaredImports,
  packageNameOf,
} from './rollup-plugin-entry-deps.js';

const chunk = (
  name: string,
  imports: string[],
  { isEntry = true, dynamicImports = [] as string[] } = {},
) => ({
  type: 'chunk',
  name,
  fileName: isEntry ? `${name}.d.ts` : `chunks/${name}.d.ts`,
  isEntry,
  imports,
  dynamicImports,
});

const bundleOf = (...chunks: ReturnType<typeof chunk>[]) =>
  Object.fromEntries([
    ...chunks.map((c) => [c.fileName, c]),
    ['asset.txt', { type: 'asset' }],
  ]) as unknown as OutputBundle;

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

describe('externalMatcher', () => {
  const isExternal = externalMatcher(['zod-openapi', '@scope/pkg']);

  it.each(['zod-openapi', 'zod-openapi/api', '@scope/pkg', '@scope/pkg/sub'])(
    'keeps %s external',
    (id) => {
      expect(isExternal(id)).toBe(true);
    },
  );

  it.each(['zod', 'zod-openapi-extra', '@scope/pkgx', './zod-openapi'])(
    'bundles %s',
    (id) => {
      expect(isExternal(id)).toBe(false);
    },
  );
});

describe('findUndeclaredImports', () => {
  const declared = {
    dependencies: { zod: '^4' },
    peerDependencies: { commander: '^15' },
  };

  it('ignores relative, absolute, and node builtin specifiers', () => {
    expect(
      findUndeclaredImports(
        ['./a.js', '../b.js', '/abs', 'node:fs', 'path', 'zod/v4', 'commander'],
        declared,
      ),
    ).toEqual([]);
  });

  it('reports undeclared packages, sorted and de-duplicated', () => {
    expect(
      findUndeclaredImports(['zz', '@a/b/c', 'zz/sub', '@a/b'], declared),
    ).toEqual(['@a/b', 'zz']);
  });

  it('treats missing dependency maps as empty', () => {
    expect(findUndeclaredImports(['zod'], {})).toEqual(['zod']);
  });

  describe('optional peers', () => {
    const withOptional = {
      ...declared,
      peerDependencies: { ...declared.peerDependencies, fastify: '^5' },
      peerDependenciesMeta: { fastify: { optional: true } },
    };

    it('rejects an optional peer the entry point does not allow', () => {
      expect(findUndeclaredImports(['fastify'], withOptional)).toEqual([
        'fastify',
      ]);
    });

    it('accepts an optional peer the entry point allows', () => {
      expect(
        findUndeclaredImports(['fastify'], withOptional, ['fastify']),
      ).toEqual([]);
    });

    it('keeps non-optional peers declared everywhere', () => {
      expect(findUndeclaredImports(['commander'], withOptional)).toEqual([]);
    });
  });

  describe('scoped dependencies', () => {
    const withScoped = {
      dependencies: { zod: '^4', fastify: '^5' },
    };

    it('rejects a scoped dependency the entry point does not allow', () => {
      expect(
        findUndeclaredImports(['fastify'], withScoped, [], ['fastify']),
      ).toEqual(['fastify']);
    });

    it('rejects a subpath of a scoped dependency the entry point does not allow', () => {
      expect(
        findUndeclaredImports(
          ['zod-openapi/api'],
          { dependencies: { 'zod-openapi': '^6' } },
          [],
          ['zod-openapi'],
        ),
      ).toEqual(['zod-openapi']);
    });

    it('accepts a scoped dependency the entry point allows', () => {
      expect(
        findUndeclaredImports(
          ['fastify'],
          withScoped,
          ['fastify'],
          ['fastify'],
        ),
      ).toEqual([]);
    });

    it('keeps unscoped dependencies declared everywhere', () => {
      expect(
        findUndeclaredImports(['zod'], withScoped, [], ['fastify']),
      ).toEqual([]);
    });
  });

  it('passes for the real package.json and its type-level imports', () => {
    expect(
      findUndeclaredImports(['@commander-js/extra-typings', 'zod'], pkg),
    ).toEqual([]);
  });
});

describe('collectEntryImports', () => {
  it('follows shared chunks transitively, once, and keeps externals', () => {
    const bundle = bundleOf(
      chunk('index', ['chunks/a.d.ts', 'zod'], { dynamicImports: ['dyn'] }),
      chunk('a', ['chunks/b.d.ts', 'chunks/a.d.ts'], { isEntry: false }),
      chunk('b', ['fastify', 'chunks/a.d.ts'], { isEntry: false }),
      chunk('other', ['commander']),
    );
    expect(collectEntryImports(bundle, 'index.d.ts').sort()).toEqual([
      'dyn',
      'fastify',
      'zod',
    ]);
  });

  it('ignores a name that is not a chunk', () => {
    expect(collectEntryImports(bundleOf(), 'asset.txt')).toEqual([]);
  });
});

describe('entryDependencyGuardPlugin', () => {
  const run = (
    bundle: OutputBundle,
    entries?: Record<string, readonly string[]>,
  ) => {
    const error = vi.fn();
    const plugin = entryDependencyGuardPlugin(
      {
        dependencies: { zod: '^4' },
        peerDependencies: { fastify: '^5' },
        peerDependenciesMeta: { fastify: { optional: true } },
      },
      entries,
    );
    const hook = plugin.generateBundle as (
      this: PluginContext,
      options: unknown,
      bundle: OutputBundle,
    ) => void;
    hook.call({ error } as unknown as PluginContext, {}, bundle);
    return error;
  };

  it('does nothing when all type imports are declared', () => {
    expect(run(bundleOf(chunk('index', ['zod'])))).not.toHaveBeenCalled();
  });

  it('allows an optional peer only where the entry point permits it', () => {
    expect(run(bundleOf(chunk('index', ['fastify'])))).toHaveBeenCalledWith(
      expect.stringContaining('index: fastify'),
    );
    expect(
      run(bundleOf(chunk('index', ['fastify'])), { index: ['fastify'] }),
    ).not.toHaveBeenCalled();
  });

  it('checks an optional peer reached through a shared chunk per entry', () => {
    const bundle = bundleOf(
      chunk('index', ['chunks/shared.d.ts']),
      chunk('fastify/index', ['chunks/shared.d.ts']),
      chunk('shared', ['fastify'], { isEntry: false }),
    );
    const error = run(bundle, { 'fastify/index': ['fastify'] });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/: index: fastify$/),
    );
  });

  it('scopes every dependency an entry point lists to the entry points listing it', () => {
    const error = vi.fn();
    const plugin = entryDependencyGuardPlugin(
      { dependencies: { zod: '^4', 'zod-openapi': '^6' } },
      { 'openapi/index': ['zod-openapi'] },
    );
    const hook = plugin.generateBundle as (
      this: PluginContext,
      options: unknown,
      bundle: OutputBundle,
    ) => void;
    hook.call(
      { error } as unknown as PluginContext,
      {},
      bundleOf(
        chunk('index', ['chunks/shared.d.ts', 'zod']),
        chunk('openapi/index', ['zod-openapi']),
        chunk('shared', ['zod-openapi'], { isEntry: false }),
      ),
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/: index: zod-openapi$/),
    );
  });

  it('fails the build on undeclared type imports', () => {
    const error = run(
      bundleOf(chunk('index', ['zod', '@commander-js/extra-typings'])),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('@commander-js/extra-typings'),
    );
  });
});
