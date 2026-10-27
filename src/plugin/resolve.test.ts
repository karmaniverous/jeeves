import { homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveOptionalPluginSetting,
  resolvePluginSetting,
} from './resolve.js';
import type { PluginApi } from './types.js';

describe('resolveWorkspacePath', () => {
  /** A fresh module, so the once-per-process warning flag is reset. */
  const load = async () => {
    vi.resetModules();
    return (await import('./resolve.js')).resolveWorkspacePath;
  };

  const apiWith = (
    workspace?: string,
    warn = vi.fn<(message: string) => void>(),
  ): PluginApi & { warn: typeof warn } => ({
    ...(workspace === undefined
      ? {}
      : { config: { agents: { defaults: { workspace } } } }),
    resolvePath: () => '/plugin/root',
    logger: { warn },
    registerTool: vi.fn(),
    warn,
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured workspace first, ~ expanded', async () => {
    const resolve = await load();
    expect(resolve(apiWith('/from/config'), { workspaceDir: '/ctx' })).toBe(
      '/from/config',
    );
    expect(resolve(apiWith('~/ws'))).toBe(join(homedir(), 'ws'));
    expect(resolve(apiWith('~'))).toBe(homedir());
  });

  it('uses ctx.workspaceDir when config is absent or blank', async () => {
    const resolve = await load();
    expect(resolve(apiWith(), { workspaceDir: '/ctx' })).toBe('/ctx');
    expect(resolve(apiWith('   '), { workspaceDir: '/ctx' })).toBe('/ctx');
  });

  it('defaults to <OPENCLAW_STATE_DIR>/workspace', async () => {
    vi.stubEnv('OPENCLAW_STATE_DIR', '/state');
    vi.stubEnv('OPENCLAW_PROFILE', 'work');
    expect((await load())(apiWith(), { workspaceDir: ' ' })).toBe(
      join('/state', 'workspace'),
    );
  });

  it('defaults to ~/.openclaw-<profile>/workspace for a non-default profile', async () => {
    vi.stubEnv('OPENCLAW_STATE_DIR', '');
    vi.stubEnv('OPENCLAW_PROFILE', 'work');
    expect((await load())(apiWith())).toBe(
      join(homedir(), '.openclaw-work', 'workspace'),
    );
  });

  it.each(['', 'default'])(
    'defaults to ~/.openclaw/workspace for profile %j',
    async (profile) => {
      vi.stubEnv('OPENCLAW_STATE_DIR', '');
      vi.stubEnv('OPENCLAW_PROFILE', profile);
      expect((await load())(apiWith())).toBe(
        join(homedir(), '.openclaw', 'workspace'),
      );
    },
  );

  it('never returns the plugin root', async () => {
    vi.stubEnv('OPENCLAW_STATE_DIR', '');
    expect((await load())(apiWith())).not.toBe('/plugin/root');
  });

  it('warns once per process, only when falling back to the default', async () => {
    vi.stubEnv('OPENCLAW_STATE_DIR', '/state');
    const resolve = await load();
    const api = apiWith();
    resolve(apiWith('/configured'));
    resolve(api, { workspaceDir: '/ctx' });
    expect(api.warn).not.toHaveBeenCalled();
    resolve(api);
    resolve(api);
    expect(api.warn).toHaveBeenCalledTimes(1);
    expect(api.warn).toHaveBeenCalledWith(
      `workspace not configured; using ${join('/state', 'workspace')}`,
    );
  });

  it('never throws, with no logger or a failing logger', async () => {
    const resolve = await load();
    expect(() => resolve({ registerTool: vi.fn() })).not.toThrow();
    const failing = await load();
    const api = apiWith(
      undefined,
      vi.fn(() => {
        throw new Error('logger down');
      }),
    );
    expect(() => failing(api)).not.toThrow();
  });
});

describe('resolvePluginSetting', () => {
  const ENV_KEY = 'TEST_RESOLVE_PLUGIN_SETTING_VAR';

  beforeEach(() => {
    Reflect.deleteProperty(process.env, ENV_KEY);
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, ENV_KEY);
    vi.restoreAllMocks();
  });

  it('resolves from plugin config first', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'my-plugin': { config: { apiUrl: 'http://configured:1234' } },
          },
        },
      },
      registerTool: vi.fn(),
    };

    process.env[ENV_KEY] = 'http://env:5678';

    expect(
      resolvePluginSetting(
        api,
        'my-plugin',
        'apiUrl',
        ENV_KEY,
        'http://fallback:9999',
      ),
    ).toBe('http://configured:1234');
  });

  it('falls back to env var when config is absent', () => {
    const api: PluginApi = { registerTool: vi.fn() };

    process.env[ENV_KEY] = 'http://env:5678';

    expect(
      resolvePluginSetting(
        api,
        'my-plugin',
        'apiUrl',
        ENV_KEY,
        'http://fallback:9999',
      ),
    ).toBe('http://env:5678');
  });

  it('falls back to default when nothing is set', () => {
    const api: PluginApi = { registerTool: vi.fn() };

    expect(
      resolvePluginSetting(
        api,
        'my-plugin',
        'apiUrl',
        ENV_KEY,
        'http://fallback:9999',
      ),
    ).toBe('http://fallback:9999');
  });

  it('skips non-string config values', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'my-plugin': { config: { apiUrl: 12345 } },
          },
        },
      },
      registerTool: vi.fn(),
    };

    expect(
      resolvePluginSetting(
        api,
        'my-plugin',
        'apiUrl',
        ENV_KEY,
        'http://fallback:9999',
      ),
    ).toBe('http://fallback:9999');
  });
});

describe('resolveOptionalPluginSetting', () => {
  const ENV_KEY = 'TEST_RESOLVE_OPTIONAL_PLUGIN_SETTING_VAR';

  beforeEach(() => {
    Reflect.deleteProperty(process.env, ENV_KEY);
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, ENV_KEY);
    vi.restoreAllMocks();
  });

  it('resolves from plugin config first', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'my-plugin': { config: { apiUrl: 'http://configured:1234' } },
          },
        },
      },
      registerTool: vi.fn(),
    };

    process.env[ENV_KEY] = 'http://env:5678';

    expect(
      resolveOptionalPluginSetting(api, 'my-plugin', 'apiUrl', ENV_KEY),
    ).toBe('http://configured:1234');
  });

  it('falls back to env var when config is absent', () => {
    const api: PluginApi = { registerTool: vi.fn() };

    process.env[ENV_KEY] = 'http://env:5678';

    expect(
      resolveOptionalPluginSetting(api, 'my-plugin', 'apiUrl', ENV_KEY),
    ).toBe('http://env:5678');
  });

  it('returns undefined when nothing is set', () => {
    const api: PluginApi = { registerTool: vi.fn() };

    expect(
      resolveOptionalPluginSetting(api, 'my-plugin', 'apiUrl', ENV_KEY),
    ).toBeUndefined();
  });

  it('skips non-string config values', () => {
    const api: PluginApi = {
      config: {
        plugins: {
          entries: {
            'my-plugin': { config: { apiUrl: 12345 } },
          },
        },
      },
      registerTool: vi.fn(),
    };

    expect(
      resolveOptionalPluginSetting(api, 'my-plugin', 'apiUrl', ENV_KEY),
    ).toBeUndefined();
  });
});
