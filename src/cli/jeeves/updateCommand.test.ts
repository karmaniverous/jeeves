/**
 * Tests for `jeeves update` wiring: fills in missing plugin config with the
 * same precedence as install, never overwrites existing values unless passed,
 * fails before any change on missing required config. Child processes are
 * faked; no OpenClaw is touched.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConsoleCapture, useUnsetEnv } from '../../test/cliHarness.js';
import { useTempDir } from '../../test/tempDir.js';
import { fakeRunner, fakeTempFiles, ok } from './plugins/fakePorts.js';
import { MissingPluginConfigError } from './plugins/pluginConfigResolve.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import { ServerPluginKeyError } from './plugins/serverKeySync.js';
import {
  type CommandTestPorts,
  npmRecord,
  S,
  SPKG,
  W,
  WPKG,
} from './plugins/workflowTestKit.js';
import { registerUpdateCommand } from './updateCommand.js';

const state = vi.hoisted((): CommandTestPorts => ({}));

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  const { createServerConfigWriter } =
    await import('./plugins/serverConfigWrite.js');
  const { commandWorkflowDeps } = await import('./plugins/workflowTestKit.js');
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean) =>
      commandWorkflowDeps(state, createServerConfigWriter(), dryRun),
  };
});

const installed = JSON.stringify([npmRecord(W, WPKG, '0.16.0')]);

describe('jeeves update (plugin config)', () => {
  const tempDir = useTempDir('jeeves-update-');
  const out = useConsoleCapture();
  useUnsetEnv('JEEVES_CONFIG_ROOT');
  let dir: string;

  const script = (entries: Record<string, unknown>) => ({
    'openclaw --version': ok('OpenClaw 2026.9.6'),
    'openclaw config get plugins': ok(JSON.stringify({ entries })),
    'openclaw plugins inspect --all --json': ok(installed),
    [`npm view ${WPKG}`]: ok('"0.16.0"'),
    [`npm view ${WPKG}@0.16.0 jeeves.conversationHooks`]: ok(''),
  });

  beforeEach(() => {
    dir = tempDir();
    state.temp = fakeTempFiles();
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
        JSON.stringify([npmRecord(S, SPKG, '0.14.0')]),
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
