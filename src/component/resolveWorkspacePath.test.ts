import { describe, expect, it } from 'vitest';

import type { PluginApiLike } from './resolveWorkspacePath.js';
import { resolveWorkspacePath } from './resolveWorkspacePath.js';

describe('resolveWorkspacePath', () => {
  it('uses api.resolvePath when available', () => {
    const api: PluginApiLike = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '/from/config' } } },
    };
    expect(resolveWorkspacePath(api)).toBe('/from/resolve-path');
  });

  it('falls back to config workspace when resolvePath is absent', () => {
    const api: PluginApiLike = {
      config: { agents: { defaults: { workspace: '/from/config' } } },
    };
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('falls back to config workspace when resolvePath is not a function', () => {
    const api = {
      resolvePath: 'not-a-function',
      config: { agents: { defaults: { workspace: '/from/config' } } },
    } as unknown as PluginApiLike;
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('ignores empty or whitespace-only config workspace', () => {
    const api: PluginApiLike = {
      config: { agents: { defaults: { workspace: '   ' } } },
    };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when nothing is configured', () => {
    const api: PluginApiLike = {};
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when config is undefined', () => {
    const api: PluginApiLike = { config: undefined };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when agents is undefined', () => {
    const api: PluginApiLike = { config: {} };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });
});
