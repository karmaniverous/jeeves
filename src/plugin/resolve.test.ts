import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolvePluginSetting, resolveWorkspacePath } from './resolve.js';
import type { PluginApi } from './types.js';

describe('resolveWorkspacePath', () => {
  it('prefers config workspace over resolvePath', () => {
    const api: PluginApi = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '/from/config' } } },
      registerTool: vi.fn(),
    };
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('falls back to resolvePath when config workspace is absent', () => {
    const api: PluginApi = {
      resolvePath: () => '/from/resolve-path',
      registerTool: vi.fn(),
    };
    expect(resolveWorkspacePath(api)).toBe('/from/resolve-path');
  });

  it('falls back to resolvePath when config workspace is empty', () => {
    const api: PluginApi = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '   ' } } },
      registerTool: vi.fn(),
    };
    expect(resolveWorkspacePath(api)).toBe('/from/resolve-path');
  });

  it('falls back to process.cwd when nothing is configured', () => {
    const api: PluginApi = { registerTool: vi.fn() };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
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
