/**
 * Tests for `jeeves update` wiring: fills in missing plugin config with the
 * same precedence as install, never overwrites existing values unless passed,
 * fails before any change on missing required config. Child processes are
 * faked; no OpenClaw is touched. The post-plugin steps are in
 * `updateCommand.steps.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POST_PLUGIN_RESULT,
  serverConfigPath,
  useCommandTest,
  writeServerConfig,
} from './commandTestHarness.js';
import { fakeRunner, ok } from './plugins/fakePorts.js';
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
import type * as PostPluginModule from './postPluginSteps.js';
import { registerUpdateCommand } from './updateCommand.js';

const state = vi.hoisted((): CommandTestPorts => ({}));

vi.mock('./postPluginSteps.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PostPluginModule>()),
  runPostPluginSteps: () => Promise.resolve(DEFAULT_POST_PLUGIN_RESULT),
}));

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
  const { paths, out, run, mutations } = useCommandTest(state, {
    prefix: 'jeeves-update-',
    register: registerUpdateCommand,
    command: 'update',
    baseArgs: ({ dir }) => ['-w', dir],
  });

  const script = (entries: Record<string, unknown>) => ({
    'openclaw --version': ok('OpenClaw 2026.9.6'),
    'openclaw config get plugins': ok(JSON.stringify({ entries })),
    'openclaw plugins inspect --all --json': ok(installed),
    [`npm view ${WPKG}`]: ok('"0.16.0"'),
    [`npm view ${WPKG}@0.16.0 jeeves.conversationHooks`]: ok(''),
  });

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
    const root = join(paths.dir, 'cfg');
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
    await run('-c', join(paths.dir, 'cfg'), '--dry-run');
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
    const serverFile = () => serverConfigPath(join(paths.dir, 'cfg'));
    const writeServer = (value: unknown) => {
      writeServerConfig(join(paths.dir, 'cfg'), value);
    };

    it("copies the plugin's key into a server config without one", async () => {
      writeServer({ port: 1934 });
      const cfg = join(paths.dir, 'cfg');
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
          configRoot: join(paths.dir, 'cfg'),
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
        serverScript({
          configRoot: join(paths.dir, 'cfg'),
          apiUrl: 'http://h:1',
        }),
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
