import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PluginsConfig } from './configPatch.js';
import {
  MissingPluginConfigError,
  type PluginConfigRequest,
  resolvePluginConfig,
} from './pluginConfigResolve.js';
import { ServerPluginKeyError } from './serverKeySync.js';
import { M, R, S, W } from './workflowTestKit.js';

const ALL = [R, W, S, M];
const SEED = 'f'.repeat(64);

function request(over: Partial<PluginConfigRequest> = {}): PluginConfigRequest {
  return {
    options: {},
    file: {},
    readServerKey: () => ({ kind: 'absent' }),
    generateSecret: () => SEED,
    ...over,
  };
}

const withConfig = (config: Record<string, Record<string, unknown>>) =>
  ({
    entries: Object.fromEntries(
      Object.entries(config).map(([id, c]) => [
        id,
        { enabled: true, config: c },
      ]),
    ),
  }) satisfies PluginsConfig;

const valueOf = (
  res: ReturnType<typeof resolvePluginConfig>,
  id: string,
  key: string,
) => res.values.find((v) => v.pluginId === id && v.key === key);

describe('resolvePluginConfig', () => {
  it('fills a fresh box: shared configRoot, default apiUrls, generated pluginKey', () => {
    const res = resolvePluginConfig(
      {},
      ALL,
      request({ options: { configRoot: '/srv/cfg' } }),
    );
    expect(res.ops).toEqual([
      { path: `plugins.entries.${R}.config.configRoot`, value: '/srv/cfg' },
      {
        path: `plugins.entries.${R}.config.apiUrl`,
        value: 'http://127.0.0.1:1937',
      },
      { path: `plugins.entries.${W}.config.configRoot`, value: '/srv/cfg' },
      {
        path: `plugins.entries.${W}.config.apiUrl`,
        value: 'http://127.0.0.1:1936',
      },
      { path: `plugins.entries.${S}.config.configRoot`, value: '/srv/cfg' },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
      { path: `plugins.entries.${S}.config.pluginKey`, value: SEED },
      { path: `plugins.entries.${M}.config.configRoot`, value: '/srv/cfg' },
      {
        path: `plugins.entries.${M}.config.apiUrl`,
        value: 'http://127.0.0.1:1938',
      },
    ]);
    expect(valueOf(res, S, 'pluginKey')).toMatchObject({
      source: 'generated',
      secret: true,
    });
    expect(res.secrets).toEqual([SEED]);
    expect(res.serverKeyWrite).toEqual({
      path: join('/srv/cfg', 'jeeves-server', 'config.json'),
      value: SEED,
      expect: { kind: 'absent' },
    });
  });

  it.each([
    [
      'option wins over everything',
      { apiUrl: 'http://opt:1' },
      { apiUrl: 'http://file:1' },
      'http://old:1',
      'http://opt:1',
      'option',
      true,
    ],
    [
      'file wins over existing',
      undefined,
      { apiUrl: 'http://file:1' },
      'http://old:1',
      'http://file:1',
      'file',
      true,
    ],
    [
      'existing wins over default',
      undefined,
      undefined,
      'http://old:1',
      'http://old:1',
      'existing',
      false,
    ],
    [
      'default when nothing else',
      undefined,
      undefined,
      undefined,
      'http://127.0.0.1:1936',
      'default',
      true,
    ],
    [
      'explicit equal to existing is not rewritten',
      { apiUrl: 'http://old:1' },
      undefined,
      'http://old:1',
      'http://old:1',
      'option',
      false,
    ],
  ] as const)('%s', (_l, opt, file, existing, value, source, write) => {
    const res = resolvePluginConfig(
      withConfig({
        [W]: { configRoot: '/c', ...(existing ? { apiUrl: existing } : {}) },
      }),
      [W],
      request({
        options: opt ? { watcher: opt } : {},
        file: file ? { watcher: file } : {},
      }),
    );
    expect(valueOf(res, W, 'apiUrl')).toMatchObject({ value, source, write });
    expect(res.ops.some((o) => o.path.endsWith('.apiUrl'))).toBe(write);
  });

  it('never overwrites existing values that were not passed', () => {
    const plugins = withConfig({
      [S]: {
        configRoot: '/old',
        apiUrl: 'http://s:1',
        pluginKey: 'existing-seed',
      },
    });
    const res = resolvePluginConfig(
      plugins,
      [S],
      request({
        inheritedConfigRoot: '/inherited',
        readServerKey: () => ({ kind: 'literal', value: 'existing-seed' }),
        generateSecret: () => {
          throw new Error('must not generate');
        },
      }),
    );
    expect(res.ops).toEqual([]);
    expect(res.values.every((v) => v.source === 'existing')).toBe(true);
    expect(res.secrets).toEqual(['existing-seed']);
    expect(res.serverKeyWrite).toBeUndefined();
  });

  it('fails when the plugin and server keys differ, naming no key', () => {
    const run = () =>
      resolvePluginConfig(
        withConfig({ [S]: { configRoot: '/c', pluginKey: 'plugin-seed' } }),
        [S],
        request({
          readServerKey: () => ({ kind: 'literal', value: 'server-seed' }),
        }),
      );
    expect(run).toThrow(ServerPluginKeyError);
    expect(run).not.toThrow(/plugin-seed|server-seed/);
  });

  it('collects the warning for a server end it cannot write', () => {
    const res = resolvePluginConfig(
      withConfig({ [S]: { configRoot: '/c', pluginKey: 'plugin-seed' } }),
      [S],
      request({ readServerKey: () => ({ kind: 'noFile' }) }),
    );
    expect(res.serverKeyWrite).toBeUndefined();
    expect(res.warnings).toEqual([
      expect.stringContaining(join('/c', 'jeeves-server', 'config.json')),
    ]);
  });

  it('--config-root overwrites an existing configRoot', () => {
    const res = resolvePluginConfig(
      withConfig({ [R]: { configRoot: '/old', apiUrl: 'http://r:1' } }),
      [R],
      request({ options: { configRoot: '/new' } }),
    );
    expect(res.ops).toEqual([
      { path: `plugins.entries.${R}.config.configRoot`, value: '/new' },
    ]);
  });

  it('uses the inherited configRoot (env / jeeves.config.json) as a default', () => {
    const res = resolvePluginConfig(
      {},
      [M],
      request({ inheritedConfigRoot: '/env' }),
    );
    expect(valueOf(res, M, 'configRoot')).toMatchObject({
      value: '/env',
      source: 'jeeves config root',
      write: true,
    });
  });

  it("takes pluginKey from the server's keys._plugin under the resolved configRoot", () => {
    const roots: string[] = [];
    const res = resolvePluginConfig(
      {},
      [S],
      request({
        options: { configRoot: '/cfg' },
        readServerKey: (root) => {
          roots.push(root);
          return { kind: 'literal', value: 'server-seed' };
        },
      }),
    );
    expect(roots).toEqual(['/cfg']);
    expect(valueOf(res, S, 'pluginKey')).toMatchObject({
      value: 'server-seed',
      source: 'server config',
    });
    expect(res.secrets).toEqual(['server-seed']);
    expect(res.serverKeyWrite).toBeUndefined();
  });

  it('takes pluginKey from --plugin-config below a CLI option', () => {
    const fromFile = resolvePluginConfig(
      {},
      [S],
      request({
        options: { configRoot: '/c' },
        file: { server: { pluginKey: 'file-seed' } },
      }),
    );
    expect(valueOf(fromFile, S, 'pluginKey')).toMatchObject({
      value: 'file-seed',
      source: 'file',
      write: true,
    });
    expect(fromFile.serverKeyWrite?.value).toBe('file-seed');

    const both = resolvePluginConfig(
      {},
      [S],
      request({
        options: { configRoot: '/c', server: { pluginKey: 'opt-seed' } },
        file: { server: { pluginKey: 'file-seed' } },
      }),
    );
    expect(valueOf(both, S, 'pluginKey')).toMatchObject({
      value: 'opt-seed',
      source: 'option',
    });
    expect(both.secrets).toEqual(['opt-seed']);
  });

  it('treats an explicit pluginKey as a secret', () => {
    const res = resolvePluginConfig(
      {},
      [S],
      request({ options: { configRoot: '/c', server: { pluginKey: 'mine' } } }),
    );
    expect(res.secrets).toEqual(['mine']);
    expect(res.serverKeyWrite?.value).toBe('mine');
  });

  it('fails with every missing required option before returning anything', () => {
    let error: unknown;
    try {
      resolvePluginConfig(
        withConfig({ [W]: { configRoot: '/w' } }),
        ALL,
        request(),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MissingPluginConfigError);
    const err = error as MissingPluginConfigError;
    expect(err.missing.map((m) => m.pluginId)).toEqual([R, S, M]);
    expect(err.message).toContain(
      `--config-root <value>: configRoot for ${R}, ${S}, ${M}`,
    );
  });

  it('leaves plugins without a known schema untouched', () => {
    const res = resolvePluginConfig(
      {},
      ['jeeves-future-openclaw'],
      request({ options: { configRoot: '/c' } }),
    );
    expect(res.ops).toEqual([]);
    expect(res.unknownPluginIds).toEqual(['jeeves-future-openclaw']);
  });
});
