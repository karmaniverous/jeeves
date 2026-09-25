/**
 * Tests for `jeeves update` wiring: fills in missing plugin config with the
 * same precedence as install, never overwrites existing values unless passed,
 * fails before any change on missing required config. Child processes are
 * faked; no OpenClaw is touched.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FakeRunner,
  fakeRunner,
  type FakeTempFiles,
  fakeTempFiles,
  ok,
} from './plugins/fakePorts.js';
import { MissingPluginConfigError } from './plugins/pluginConfigResolve.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import { ServerPluginKeyError } from './plugins/serverKeySync.js';
import type { PluginWorkflowDeps } from './plugins/workflows.js';
import { registerUpdateCommand } from './updateCommand.js';

const W = 'jeeves-watcher-openclaw';
const S = 'jeeves-server-openclaw';
const SPKG = `@karmaniverous/${S}`;
const WPKG = `@karmaniverous/${W}`;

const state = vi.hoisted(() => ({
  fake: undefined as FakeRunner | undefined,
  temp: undefined as FakeTempFiles | undefined,
}));

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  const { createServerConfigWriter } =
    await import('./plugins/serverConfigWrite.js');
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean): PluginWorkflowDeps => {
      if (!state.fake || !state.temp) throw new Error('no fakes');
      return {
        runner: state.fake.runner,
        fs: {
          isDirectory: () => false,
          readPackageName: () => undefined,
          removeDir: () => undefined,
        },
        tempFiles: state.temp.files,
        serverConfig: createServerConfigWriter(),
        configDir: '/oc',
        log: (line) => {
          console.log(line);
        },
        dryRun,
      };
    },
  };
});

const installed = JSON.stringify([
  {
    plugin: { id: W, version: '0.16.0' },
    install: { source: 'npm', resolvedName: WPKG, resolvedVersion: '0.16.0' },
  },
]);

describe('jeeves update (plugin config)', () => {
  let dir: string;
  let out: string[];
  let savedRoot: string | undefined;

  const script = (entries: Record<string, unknown>) => ({
    'openclaw --version': ok('OpenClaw 2026.9.6'),
    'openclaw config get plugins': ok(JSON.stringify({ entries })),
    'openclaw plugins inspect --all --json': ok(installed),
    [`npm view ${WPKG}`]: ok('"0.16.0"'),
    [`npm view ${WPKG}@0.16.0 jeeves.conversationHooks`]: ok(''),
  });

  beforeEach(() => {
    dir = join(
      tmpdir(),
      `jeeves-update-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(dir, { recursive: true });
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
    savedRoot = process.env['JEEVES_CONFIG_ROOT'];
    delete process.env['JEEVES_CONFIG_ROOT'];
    state.temp = fakeTempFiles();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedRoot !== undefined) process.env['JEEVES_CONFIG_ROOT'] = savedRoot;
    else delete process.env['JEEVES_CONFIG_ROOT'];
    rmSync(dir, { recursive: true, force: true });
  });

  const run = async (...args: string[]) => {
    const program = new Command().exitOverride();
    registerUpdateCommand(program);
    await program.parseAsync(['update', '-w', dir, ...args], {
      from: 'user',
    });
  };
  const mutations = () =>
    (state.fake?.lines() ?? []).filter((l) =>
      / plugins install | config set /.test(` ${l} `),
    );

  it('fills in a missing default without touching existing values or reinstalling', async () => {
    state.fake = fakeRunner(
      script({ [W]: { config: { configRoot: '/cfg' } } }),
    );
    await run();
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]).toMatch(/^openclaw config set --batch-file /);
    expect(state.temp?.batch()).toEqual([
      {
        path: `plugins.entries.${W}.config.apiUrl`,
        value: 'http://127.0.0.1:1936',
      },
    ]);
    expect(out.some((l) => l.startsWith('✅ Plugins updated.'))).toBe(true);
  });

  it('changes nothing when the plugin is current and its config complete', async () => {
    state.fake = fakeRunner(
      script({
        [W]: { config: { configRoot: '/cfg', apiUrl: 'http://h:1' } },
      }),
    );
    await run();
    expect(mutations()).toEqual([]);
    expect(out).toContain('✅ Plugins already up to date.');
  });

  it('overwrites an existing value only when passed explicitly', async () => {
    state.fake = fakeRunner(
      script({
        [W]: { config: { configRoot: '/cfg', apiUrl: 'http://h:1' } },
      }),
    );
    await run('watcher', '--watcher-api-url', 'http://h:2');
    expect(state.temp?.batch()).toEqual([
      { path: `plugins.entries.${W}.config.apiUrl`, value: 'http://h:2' },
    ]);
  });

  it('takes configRoot from JEEVES_CONFIG_ROOT', async () => {
    const root = join(dir, 'cfg');
    process.env['JEEVES_CONFIG_ROOT'] = root;
    state.fake = fakeRunner(script({ [W]: { enabled: true } }));
    await run();
    expect(state.temp?.batch()).toEqual([
      { path: `plugins.entries.${W}.config.configRoot`, value: resolve(root) },
      {
        path: `plugins.entries.${W}.config.apiUrl`,
        value: 'http://127.0.0.1:1936',
      },
    ]);
  });

  it('fails before any change when required config is missing', async () => {
    state.fake = fakeRunner(script({ [W]: { enabled: true } }));
    await expect(run()).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(mutations()).toEqual([]);
  });

  it('dry run prints the config and changes nothing', async () => {
    state.fake = fakeRunner(script({ [W]: { enabled: true } }));
    await run('-c', join(dir, 'cfg'), '--dry-run');
    expect(mutations()).toEqual([]);
    expect(state.temp?.written).toEqual([]);
    expect(out).toContain(
      `  ${W}.apiUrl = "http://127.0.0.1:1936" (default; write)`,
    );
    expect(out).toContain('Dry run complete. Nothing was changed.');
  });

  describe('server plugin key', () => {
    const serverScript = (config: Record<string, unknown>) => ({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok(
        JSON.stringify({ entries: { [S]: { config } } }),
      ),
      'openclaw plugins inspect --all --json': ok(
        JSON.stringify([
          {
            plugin: { id: S, version: '0.14.0' },
            install: {
              source: 'npm',
              resolvedName: SPKG,
              resolvedVersion: '0.14.0',
            },
          },
        ]),
      ),
      [`npm view ${SPKG}`]: ok('"0.14.0"'),
      [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(''),
    });
    const serverFile = () => join(dir, 'cfg', 'jeeves-server', 'config.json');
    const writeServer = (value: unknown) => {
      mkdirSync(join(dir, 'cfg', 'jeeves-server'), { recursive: true });
      writeFileSync(serverFile(), JSON.stringify(value, null, 2) + '\n');
    };

    it("copies the plugin's key into a server config without one", async () => {
      writeServer({ port: 1934 });
      const cfg = join(dir, 'cfg');
      state.fake = fakeRunner(
        serverScript({
          configRoot: cfg,
          apiUrl: 'http://h:1',
          pluginKey: 'pk-9f3a',
        }),
      );
      await run();
      expect(JSON.parse(readFileSync(serverFile(), 'utf-8'))).toEqual({
        port: 1934,
        keys: { _plugin: 'pk-9f3a' },
      });
      expect(
        readdirSync(join(cfg, 'jeeves-server')).some((f) =>
          f.startsWith('config.json.bak-'),
        ),
      ).toBe(true);
      expect(mutations()).toEqual([]);
      const printed = out.join('\n');
      expect(printed).toContain('Restart jeeves-server');
      expect(printed).not.toContain('pk-9f3a');
    });

    it('fails before any change when the keys differ', async () => {
      writeServer({ keys: { _plugin: 'server-seed' } });
      const before = readFileSync(serverFile(), 'utf-8');
      state.fake = fakeRunner(
        serverScript({
          configRoot: join(dir, 'cfg'),
          pluginKey: 'plugin-seed',
        }),
      );
      await expect(run()).rejects.toBeInstanceOf(ServerPluginKeyError);
      expect(readFileSync(serverFile(), 'utf-8')).toBe(before);
      expect(mutations()).toEqual([]);
    });

    it('dry run names the server write but changes nothing', async () => {
      writeServer({ keys: {} });
      const before = readFileSync(serverFile(), 'utf-8');
      state.fake = fakeRunner(
        serverScript({ configRoot: join(dir, 'cfg'), apiUrl: 'http://h:1' }),
      );
      await run('--dry-run', '--server-plugin-key', 'explicit-seed');
      expect(readFileSync(serverFile(), 'utf-8')).toBe(before);
      expect(mutations()).toEqual([]);
      const printed = out.join('\n');
      expect(printed).toContain(
        `[dry-run] set keys._plugin = <redacted> in ${serverFile()}`,
      );
      expect(printed).not.toContain('explicit-seed');
    });
  });
});
