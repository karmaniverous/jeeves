import { afterEach, describe, expect, it } from 'vitest';

import {
  getComponentConfigDir,
  getComponentConfigPath,
  getConfigRoot,
  getCoreConfigDir,
  getCoreConfigFile,
  getWorkspacePath,
  init,
  registerComponentConfigPath,
  resetInit,
} from './init';

describe('init', () => {
  afterEach(() => {
    resetInit();
  });

  it('should throw before init is called', () => {
    expect(() => getWorkspacePath()).toThrow('init() must be called first');
    expect(() => getConfigRoot()).toThrow('init() must be called first');
    expect(() => getCoreConfigDir()).toThrow('init() must be called first');
    expect(() => getCoreConfigFile()).toThrow('init() must be called first');
    expect(() => getComponentConfigDir('watcher')).toThrow(
      'init() must be called first',
    );
    expect(() => {
      registerComponentConfigPath('watcher', '/path');
    }).toThrow('init() must be called first');
    expect(() => getComponentConfigPath('watcher')).toThrow(
      'init() must be called first',
    );
  });

  it('should cache paths after init', () => {
    init({ workspacePath: '/workspace', configRoot: '/config' });
    expect(getWorkspacePath()).toBe('/workspace');
    expect(getConfigRoot()).toBe('/config');
  });

  it('should derive core config directory', () => {
    init({ workspacePath: '/workspace', configRoot: '/config' });
    expect(getCoreConfigDir()).toMatch(/jeeves-core$/);
  });

  it('should derive core config file path', () => {
    init({ workspacePath: '/workspace', configRoot: '/config' });
    expect(getCoreConfigFile()).toMatch(/jeeves-core[/\\]config\.json$/);
  });

  it('should derive component config directories', () => {
    init({ workspacePath: '/workspace', configRoot: '/config' });
    expect(getComponentConfigDir('watcher')).toMatch(/jeeves-watcher$/);
    expect(getComponentConfigDir('runner')).toMatch(/jeeves-runner$/);
    expect(getComponentConfigDir('server')).toMatch(/jeeves-server$/);
    expect(getComponentConfigDir('meta')).toMatch(/jeeves-meta$/);
  });

  it('should allow re-initialization', () => {
    init({ workspacePath: '/ws1', configRoot: '/cfg1' });
    expect(getWorkspacePath()).toBe('/ws1');

    init({ workspacePath: '/ws2', configRoot: '/cfg2' });
    expect(getWorkspacePath()).toBe('/ws2');
  });

  it('should register and retrieve component config paths', () => {
    init({ workspacePath: '/workspace', configRoot: '/config' });

    expect(getComponentConfigPath('watcher')).toBeUndefined();

    registerComponentConfigPath('watcher', '/custom/path/config.json');
    expect(getComponentConfigPath('watcher')).toBe('/custom/path/config.json');

    // Other components remain unregistered
    expect(getComponentConfigPath('runner')).toBeUndefined();
  });

  it('should clear registered paths on re-initialization', () => {
    init({ workspacePath: '/ws1', configRoot: '/cfg1' });
    registerComponentConfigPath('watcher', '/custom/path/config.json');
    expect(getComponentConfigPath('watcher')).toBe('/custom/path/config.json');

    init({ workspacePath: '/ws2', configRoot: '/cfg2' });
    expect(getComponentConfigPath('watcher')).toBeUndefined();
  });
});
