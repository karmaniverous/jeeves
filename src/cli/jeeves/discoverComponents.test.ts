import type * as ChildProcess from 'node:child_process';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import spawn from 'cross-spawn';
import { afterEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.hoisted(() =>
  vi.fn<(command: string, options?: object) => string>(),
);
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  execSync: execSyncMock,
}));

import {
  componentBin,
  componentCandidates,
  defaultDiscoveryPorts,
  discoverComponentPackages,
  type DiscoveryPorts,
  registerComponentProxies,
  runBin,
} from './discoverComponents';

const ROOT = resolve('/global/node_modules');

/** Ports over a fake global install. */
function ports(
  packages: Record<string, object | Error>,
  overrides: Partial<DiscoveryPorts> = {},
): DiscoveryPorts {
  return {
    listGlobal: () =>
      JSON.stringify({
        dependencies: Object.fromEntries(
          Object.keys(packages).map((p) => [p, { version: '1.0.0' }]),
        ),
      }),
    globalRoot: () => ROOT,
    readPackageJson: (dir) => {
      const name = Object.keys(packages).find((p) => join(ROOT, p) === dir);
      const pkg = name === undefined ? undefined : packages[name];
      if (pkg === undefined || pkg instanceof Error)
        throw pkg ?? new Error('ENOENT');
      return pkg;
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  execSyncMock.mockReset();
  process.exitCode = undefined;
});

describe('componentCandidates', () => {
  it('keeps scoped jeeves-<name> packages with valid names, not -openclaw', () => {
    expect(
      componentCandidates([
        '@karmaniverous/jeeves-watcher',
        '@karmaniverous/jeeves-watcher-openclaw',
        '@karmaniverous/jeeves-tools',
        '@karmaniverous/jeeves-my-thing',
        '@karmaniverous/jeeves',
        '@karmaniverous/jeeves-Bad',
        '@karmaniverous/jeeves-9lives',
        '@other/jeeves-runner',
        '@someone-else/jeeves-runner',
        'jeeves-runner',
      ]),
    ).toEqual(['watcher', 'tools', 'my-thing']);
  });
});

describe('componentBin', () => {
  it('prefers jeeves-<name>, else the only entry, else none', () => {
    expect(componentBin('x', { bin: 'cli.js' })).toBe('cli.js');
    expect(
      componentBin('x', { bin: { other: 'o.js', 'jeeves-x': 'x.js' } }),
    ).toBe('x.js');
    expect(componentBin('x', { bin: { only: 'only.js' } })).toBe('only.js');
    expect(
      componentBin('x', { bin: { a: 'a.js', b: 'b.js' } }),
    ).toBeUndefined();
    expect(componentBin('x', {})).toBeUndefined();
  });
});

describe('discoverComponentPackages', () => {
  const bin = (name: string) => ({
    bin: { [`jeeves-${name}`]: 'dist/cli.js' },
  });

  it('registers the four services and marked packages, with absolute bins', () => {
    const found = discoverComponentPackages(
      ports({
        '@karmaniverous/jeeves-runner': bin('runner'),
        '@karmaniverous/jeeves-watcher': bin('watcher'),
        '@karmaniverous/jeeves-server': bin('server'),
        '@karmaniverous/jeeves-meta': bin('meta'),
        '@karmaniverous/jeeves-my-thing': {
          ...bin('my-thing'),
          jeeves: { component: true },
        },
        '@karmaniverous/jeeves-tools': bin('tools'),
        '@karmaniverous/jeeves-watcher-openclaw': {
          ...bin('watcher-openclaw'),
          jeeves: { component: true },
        },
        '@karmaniverous/jeeves-unmarked': {
          ...bin('unmarked'),
          jeeves: { component: 'yes' },
        },
      }),
    );
    expect(found.map((c) => c.name)).toEqual([
      'runner',
      'watcher',
      'server',
      'meta',
      'my-thing',
    ]);
    expect(found[4].bin).toBe(
      resolve(ROOT, '@karmaniverous/jeeves-my-thing', 'dist/cli.js'),
    );
  });

  it('skips unreadable packages and packages without a usable bin', () => {
    expect(
      discoverComponentPackages(
        ports({
          '@karmaniverous/jeeves-runner': new Error('EACCES'),
          '@karmaniverous/jeeves-meta': { bin: { a: 'a', b: 'b' } },
          '@karmaniverous/jeeves-server': bin('server'),
        }),
      ).map((c) => c.name),
    ).toEqual(['server']);
  });

  it('returns none when npm fails or prints no dependencies', () => {
    const fail = () => {
      throw new Error('npm missing');
    };
    expect(discoverComponentPackages(ports({}, { listGlobal: fail }))).toEqual(
      [],
    );
    expect(
      discoverComponentPackages(
        ports(
          { '@karmaniverous/jeeves-runner': bin('runner') },
          { globalRoot: fail },
        ),
      ),
    ).toEqual([]);
    expect(
      discoverComponentPackages(ports({}, { listGlobal: () => '{}' })),
    ).toEqual([]);
  });

  it('does not ask for the global root when there are no candidates', () => {
    const globalRoot = vi.fn(() => ROOT);
    discoverComponentPackages(ports({ lodash: {} }, { globalRoot }));
    expect(globalRoot).not.toHaveBeenCalled();
  });
});

describe('defaultDiscoveryPorts', () => {
  it('reads package.json from a directory', () => {
    expect(defaultDiscoveryPorts.readPackageJson(process.cwd())).toMatchObject({
      name: '@karmaniverous/jeeves',
    });
  });

  it('asks npm for the global list and root, with a timeout', () => {
    execSyncMock.mockReturnValueOnce('{"dependencies":{}}');
    expect(defaultDiscoveryPorts.listGlobal()).toBe('{"dependencies":{}}');
    execSyncMock.mockReturnValueOnce('/g/node_modules\n');
    expect(defaultDiscoveryPorts.globalRoot()).toBe('/g/node_modules');
    expect(execSyncMock.mock.calls.map((c) => c[0])).toEqual([
      'npm ls -g --json --depth=0',
      'npm root -g',
    ]);
    expect(execSyncMock.mock.calls[0][1]).toMatchObject({ timeout: 10_000 });
  });
});

describe('registerComponentProxies', () => {
  const component = { name: 'watcher', bin: '/g/watcher/cli.js' };

  it('registers one described command per component', () => {
    const program = new Command();
    registerComponentProxies(program, [component, { name: 'meta', bin: 'm' }]);
    expect(program.commands.map((c) => [c.name(), c.description()])).toEqual([
      ['watcher', 'Proxy to jeeves-watcher CLI'],
      ['meta', 'Proxy to jeeves-meta CLI'],
    ]);
  });

  it('forwards every argument, including --help, and the exit code', async () => {
    const run = vi.fn(() => 3);
    const program = new Command().exitOverride();
    registerComponentProxies(program, [component], run);
    await program.parseAsync(
      ['watcher', 'search', 'q', '--limit', '5', '--help'],
      { from: 'user' },
    );
    expect(run).toHaveBeenCalledWith('/g/watcher/cli.js', [
      'search',
      'q',
      '--limit',
      '5',
      '--help',
    ]);
    expect(process.exitCode).toBe(3);
  });

  it('leaves the exit code alone on success or a signal', async () => {
    for (const status of [0, null]) {
      const program = new Command();
      registerComponentProxies(program, [component], () => status);
      await program.parseAsync(['watcher'], { from: 'user' });
      expect(process.exitCode).toBeUndefined();
    }
  });
});

describe('runBin', () => {
  it('runs the bin with this Node, no shell, stdio inherited', () => {
    const sync = vi
      .spyOn(spawn, 'sync')
      .mockReturnValue({ status: 7 } as ReturnType<typeof spawn.sync>);
    expect(runBin('/g/cli.js', ['a b', '--x'])).toBe(7);
    expect(sync).toHaveBeenCalledWith(
      process.execPath,
      ['/g/cli.js', 'a b', '--x'],
      { stdio: 'inherit', shell: false },
    );
  });
});
