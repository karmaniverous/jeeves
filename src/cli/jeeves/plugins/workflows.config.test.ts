import { describe, expect, it } from 'vitest';

import {
  MissingPluginConfigError,
  type PluginConfigRequest,
} from './pluginConfigResolve.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { ok } from './testRunner.js';
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
    readServerPluginKey: () => undefined,
    generateSecret: () => SEED,
    ...over,
  });

  it('writes hook access and plugin config in one batch file, preserving unrelated keys', async () => {
    const { fake, temp, log, deps } = setupWorkflow({
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
  });

  it('dry run prints computed config and the batch with the secret redacted', async () => {
    const { fake, temp, log, deps } = setupWorkflow(
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
