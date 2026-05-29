import { afterEach, describe, expect, it, vi } from 'vitest';

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

  describe('Windows drive-letter path rejection', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw for a Windows drive-letter configRoot on non-Windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

      expect(() => {
        init({ workspacePath: '/opt/workspace', configRoot: 'j:/config' });
      }).toThrow(/Windows.*drive.letter/i);
    });

    it('should throw for a Windows drive-letter workspacePath on non-Windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

      expect(() => {
        init({ workspacePath: 'C:\\workspace', configRoot: '/etc/config' });
      }).toThrow(/Windows.*drive.letter/i);
    });

    it('should succeed with a relative configRoot on non-Windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

      expect(() => {
        init({ workspacePath: '/opt/workspace', configRoot: './config' });
      }).not.toThrow();
    });

    it('should allow drive-letter paths on Windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

      expect(() => {
        init({ workspacePath: 'C:\\workspace', configRoot: 'j:/config' });
      }).not.toThrow();
    });
  });
});

describe('getCoreConfigDir', () => {
  afterEach(() => {
    resetInit();
    vi.restoreAllMocks();
  });

  it('should produce no colon-containing path segments for a relative configRoot', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    init({ workspacePath: '/opt/workspace', configRoot: './config' });
    const dir = getCoreConfigDir();

    for (const segment of dir.split('/')) {
      expect(segment).not.toContain(':');
    }
  });
});
