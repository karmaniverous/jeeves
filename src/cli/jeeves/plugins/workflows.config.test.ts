import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ok } from './fakePorts.js';
import {
  MissingPluginConfigError,
  type PluginConfigRequest,
} from './pluginConfigResolve.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { ServerPluginKeyError } from './serverKeySync.js';
import { installPlugins } from './workflows.js';
import { mutating, S, setupWorkflow, SPKG, W } from './workflowTestKit.js';

const PLUGINS = JSON.stringify({
  entries: {
    [W]: { enabled: true, config: { apiUrl: 'http://127.0.0.1:1936' } },
  },
});

describe('installPlugins with plugin config', () => {
  const SEED = '0123456789abcdef'.repeat(4);
  const request = (
    over: Partial<PluginConfigRequest> = {},
  ): PluginConfigRequest => ({
    options: { configRoot: '/srv/cfg' },
    file: {},
    readServerKey: () => ({ kind: 'absent' }),
    generateSecret: () => SEED,
    ...over,
  });

  const SERVER_CONFIG = join('/srv/cfg', 'jeeves-server', 'config.json');
  const pluginsWithKey = (pluginKey: string) =>
    ok(
      JSON.stringify({
        entries: { [S]: { config: { configRoot: '/srv/cfg', pluginKey } } },
      }),
    );

  it('writes hook access and plugin config in one batch file, preserving unrelated keys', async () => {
    const { fake, temp, log, serverWrites, deps } = setupWorkflow({
      'openclaw config get plugins': ok(PLUGINS),
    });
    await installPlugins(deps, parsePluginSpecs(['watcher', 'server']), {
      configRequest: request(),
    });

    const sets = fake.lines().filter((l) => l.includes(' config set '));
    expect(sets).toHaveLength(1);
    expect(temp.batch()).toEqual([
      {
        path: `plugins.entries.${W}.hooks.allowConversationAccess`,
        value: true,
      },
      { path: `plugins.entries.${W}.config.configRoot`, value: '/srv/cfg' },
      { path: `plugins.entries.${S}.config.configRoot`, value: '/srv/cfg' },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
      { path: `plugins.entries.${S}.config.pluginKey`, value: SEED },
    ]);
    // The secret is only in the temp file: never on a command line or log.
    expect(fake.lines().join('\n')).not.toContain(SEED);
    expect(log.join('\n')).not.toContain(SEED);
    expect(log.some((l) => l.includes('<redacted>'))).toBe(true);
    // The generated key also went to the server config, before OpenClaw.
    expect(serverWrites).toEqual([
      { path: SERVER_CONFIG, value: SEED, expect: { kind: 'absent' } },
    ]);
    const serverLine = log.findIndex((l) => l.startsWith('set keys._plugin'));
    const installLine = log.findIndex((l) => l.includes('plugins install'));
    expect(serverLine).toBeGreaterThanOrEqual(0);
    expect(serverLine).toBeLessThan(installLine);
  });

  it('dry run prints computed config and the batch with the secret redacted', async () => {
    const { fake, temp, log, serverWrites, deps } = setupWorkflow(
      { 'openclaw config get plugins': ok('{}') },
      {},
      true,
    );
    await installPlugins(deps, parsePluginSpecs(['server']), {
      configRequest: request(),
    });
    expect(mutating(fake.lines())).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(log).toContain(`  ${S}.pluginKey = <redacted> (generated; write)`);
    expect(
      log.some(
        (l) =>
          l.startsWith('[dry-run]   batch file content: [') &&
          l.includes('"value":"<redacted>"'),
      ),
    ).toBe(true);
    expect(log.join('\n')).not.toContain(SEED);
    expect(serverWrites).toEqual([]);
    expect(
      log.some((l) =>
        l.startsWith(
          `[dry-run] set keys._plugin = <redacted> in ${SERVER_CONFIG}`,
        ),
      ),
    ).toBe(true);
  });

  it('fails before any change when the two ends hold different keys', async () => {
    const { fake, temp, serverWrites, deps } = setupWorkflow({
      'openclaw config get plugins': pluginsWithKey('plugin-seed'),
    });
    await expect(
      installPlugins(deps, parsePluginSpecs(['server']), {
        configRequest: request({
          options: {},
          readServerKey: () => ({ kind: 'literal', value: 'server-seed' }),
        }),
      }),
    ).rejects.toBeInstanceOf(ServerPluginKeyError);
    expect(mutating(fake.lines())).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(serverWrites).toEqual([]);
  });

  it('--server-plugin-key resolves a conflict by writing both ends', async () => {
    const { temp, serverWrites, deps } = setupWorkflow({
      'openclaw config get plugins': pluginsWithKey('plugin-seed'),
    });
    await installPlugins(deps, parsePluginSpecs(['server']), {
      configRequest: request({
        options: { server: { pluginKey: SEED } },
        readServerKey: () => ({ kind: 'literal', value: 'server-seed' }),
      }),
    });
    expect(serverWrites).toEqual([
      {
        path: SERVER_CONFIG,
        value: SEED,
        expect: { kind: 'literal', value: 'server-seed' },
      },
    ]);
    expect(temp.batch()).toContainEqual({
      path: `plugins.entries.${S}.config.pluginKey`,
      value: SEED,
    });
  });

  it('copies the plugin key into a server config that has none', async () => {
    const { temp, serverWrites, deps } = setupWorkflow({
      'openclaw config get plugins': pluginsWithKey('plugin-seed'),
    });
    await installPlugins(deps, parsePluginSpecs(['server']), {
      configRequest: request({ options: {} }),
    });
    expect(serverWrites).toEqual([
      { path: SERVER_CONFIG, value: 'plugin-seed', expect: { kind: 'absent' } },
    ]);
    expect(temp.batch()).not.toContainEqual(
      expect.objectContaining({
        path: `plugins.entries.${S}.config.pluginKey`,
      }),
    );
  });

  it('fails before any change when a key would be generated without a server config', async () => {
    const { fake, serverWrites, deps } = setupWorkflow({
      'openclaw config get plugins': ok('{}'),
    });
    await expect(
      installPlugins(deps, parsePluginSpecs(['server']), {
        configRequest: request({ readServerKey: () => ({ kind: 'noFile' }) }),
      }),
    ).rejects.toThrow(/not found/);
    expect(mutating(fake.lines())).toEqual([]);
    expect(serverWrites).toEqual([]);
  });

  it('fails on missing required config before any mutation', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok('{}'),
    });
    await expect(
      installPlugins(deps, parsePluginSpecs(['server']), {
        configRequest: request({ options: {} }),
      }),
    ).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(mutating(fake.lines())).toEqual([]);
  });

  it('fills in missing config for a plugin whose install is skipped', async () => {
    const { fake, temp, deps } = setupWorkflow({
      'openclaw config get plugins': ok(
        JSON.stringify({
          entries: {
            [S]: {
              config: { configRoot: '/srv/cfg', pluginKey: 'existing' },
            },
          },
        }),
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
    });
    await installPlugins(deps, parsePluginSpecs(['server']), {
      configRequest: request({ options: {} }),
    });
    expect(mutating(fake.lines()).some((l) => l.includes('install'))).toBe(
      false,
    );
    expect(temp.batch()).toEqual([
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
    ]);
  });
});
