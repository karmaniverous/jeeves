import { describe, expect, it, vi } from 'vitest';

import type { PluginApi } from '../plugin/types.js';
import { resolveWorkspacePath } from './resolveWorkspacePath.js';

describe('resolveWorkspacePath', () => {
  it('prefers config workspace over resolvePath', () => {
    const api: PluginApi = {
      resolvePath: () => '/from/resolve-path',
      config: { agents: { defaults: { workspace: '/from/config' } } },
      registerTool: vi.fn(),
    };
    expect(resolveWorkspacePath(api)).toBe('/from/config');
  });

  it('uses config workspace when resolvePath is absent', () => {
    const api: PluginApi = {
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

  it('falls back to process.cwd when workspace is whitespace and resolvePath is absent', () => {
    const api: PluginApi = {
      config: { agents: { defaults: { workspace: '   ' } } },
      registerTool: vi.fn(),
    };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when nothing is configured', () => {
    const api: PluginApi = { registerTool: vi.fn() };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when config is undefined', () => {
    const api: PluginApi = { config: undefined, registerTool: vi.fn() };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });

  it('falls back to process.cwd when agents is undefined', () => {
    const api: PluginApi = { config: {}, registerTool: vi.fn() };
    expect(resolveWorkspacePath(api)).toBe(process.cwd());
  });
});
