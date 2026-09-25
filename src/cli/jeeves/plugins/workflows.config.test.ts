import { describe, expect, it } from 'vitest';

import {
  MissingPluginConfigError,
  type PluginConfigRequest,
} from './pluginConfigResolve.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { fakeRunner, ok } from './testRunner.js';
import { installPlugins, type PluginWorkflowDeps } from './workflows.js';

const W = 'jeeves-watcher-openclaw';
const WPKG = `@karmaniverous/${W}`;

const PLUGINS = JSON.stringify({
  entries: {
    [W]: { enabled: true, config: { apiUrl: 'http://127.0.0.1:1936' } },
  },
});

const mutating = (lines: string[]) =>
  lines.filter((l) =>
    / plugins (install|uninstall) | config (set|unset) /.test(` ${l} `),
  );

function setup(script: Parameters<typeof fakeRunner>[0]) {
  const fake = fakeRunner({
    'openclaw --version': ok('OpenClaw 2026.9.6'),
    [`npm view ${WPKG}`]: ok('"0.16.0"'),
    ...script,
  });
  const log: string[] = [];
  const deps: PluginWorkflowDeps = {
    runner: fake.runner,
    fs: {
      isDirectory: () => false,
      readPackageName: () => undefined,
      removeDir: () => undefined,
    },
    configDir: '/oc',
    log: (l) => log.push(l),
    dryRun: false,
  };
  return { fake, log, deps };
}

describe('installPlugins with plugin config', () => {
  const S = 'jeeves-server-openclaw';
  const SPKG = `@karmaniverous/${S}`;
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
  const withServer = (script: Parameters<typeof fakeRunner>[0] = {}) =>
    setup({ [`npm view ${SPKG}`]: ok('"0.14.0"'), ...script });

  it('writes hook access and plugin config in one batch, preserving unrelated keys', async () => {
    const { fake, log, deps } = withServer({
      'openclaw config get plugins': ok(PLUGINS),
    });
    await installPlugins(
      deps,
      parsePluginSpecs(['watcher', 'server']),
      request(),
    );

    const sets = fake.lines().filter((l) => l.includes(' config set '));
    expect(sets).toHaveLength(1);
    const batch = fake.calls.find((c) => c.args[1] === 'set');
    const ops: unknown = JSON.parse(batch?.args[3] ?? '[]');
    expect(ops).toEqual([
      {
        path: `plugins.entries.${W}.hooks.allowConversationAccess`,
        value: true,
      },
      {
        path: `plugins.entries.${S}.hooks.allowConversationAccess`,
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
    // Existing watcher apiUrl is kept; no whole-object writes.
    expect(fake.lines().join('\n')).not.toContain('"path":"plugins.entries"');
    expect(log.join('\n')).not.toContain(SEED);
    expect(log.some((l) => l.includes('<redacted>'))).toBe(true);
  });

  it('dry run prints computed config and the batch with the secret redacted', async () => {
    const { fake, log, deps } = withServer({
      'openclaw config get plugins': ok('{}'),
    });
    deps.dryRun = true;
    await installPlugins(deps, parsePluginSpecs(['server']), request());
    expect(mutating(fake.lines())).toEqual([]);
    expect(log).toContain(`  ${S}.pluginKey = <redacted> (generated; write)`);
    expect(
      log.some(
        (l) =>
          l.startsWith("[dry-run] openclaw config set --batch-json '[") &&
          l.includes('"value":"<redacted>"'),
      ),
    ).toBe(true);
    expect(log.join('\n')).not.toContain(SEED);
  });

  it('fails on missing required config before any mutation', async () => {
    const { fake, deps } = withServer({
      'openclaw config get plugins': ok('{}'),
    });
    await expect(
      installPlugins(
        deps,
        parsePluginSpecs(['server']),
        request({ options: {} }),
      ),
    ).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(mutating(fake.lines())).toEqual([]);
  });
});
