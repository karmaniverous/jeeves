import { describe, expect, it } from 'vitest';

import type { PluginApiLike } from './resolveWorkspacePath.js';
import { resolveWorkspacePath } from './resolveWorkspacePath.js';

describe('resolveWorkspacePath', () => {
  it('prefers config workspace over resolvePath', () => {
    const api: PluginApiLike = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '/from/config' } } },
    };
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('uses config workspace when resolvePath is absent', () => {
    const api: PluginApiLike = {
      config: { agents: { defaults: { workspace: '/from/config' } } },
    };
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('falls back to resolvePath when config workspace is absent', () => {
    const api: PluginApiLike = {
      resolvePath: () => '/from/resolve-path',
    };
    expect(resolveWorkspacePath(api)).toBe('/from/resolve-path');
  });

  it('falls back to resolvePath when config workspace is empty', () => {
    const api: PluginApiLike = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '   ' } } },
    };
    expect(resolveWorkspacePath(api)).toBe('/from/resolve-path');
  });

  it('falls back to process.cwd when workspace is whitespace and resolvePath is absent', () => {
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
