import { describe, expect, it } from 'vitest';

import {
  assertWritablePath,
  configBatchPayload,
  configGetArgs,
  configSetBatchFileArgs,
  configUnsetArgs,
  npmViewFieldArgs,
  npmViewVersionArgs,
  pluginInstallArgs,
  pluginsInspectAllArgs,
  pluginUninstallArgs,
} from './openclawCommands.js';

describe('openclaw command construction', () => {
  it('builds the standard npm plugin install (S1: --force required)', () => {
    expect(
      pluginInstallArgs('@karmaniverous/jeeves-watcher-openclaw', '0.16.0'),
    ).toEqual([
      'plugins',
      'install',
      'npm:@karmaniverous/jeeves-watcher-openclaw@0.16.0',
      '--pin',
      '--accept-capabilities',
      '--force',
    ]);
  });

  it('builds a non-interactive uninstall', () => {
    expect(pluginUninstallArgs('jeeves-meta-openclaw')).toEqual([
      'plugins',
      'uninstall',
      'jeeves-meta-openclaw',
      '--force',
    ]);
  });

  it('builds read-only queries', () => {
    expect(configGetArgs('plugins')).toEqual([
      'config',
      'get',
      'plugins',
      '--json',
    ]);
    expect(npmViewVersionArgs('@karmaniverous/x-openclaw', '^1')).toEqual([
      'view',
      '@karmaniverous/x-openclaw@^1',
      'version',
      '--json',
    ]);
    expect(
      npmViewFieldArgs('@karmaniverous/x-openclaw', '1.0.0', 'jeeves.a'),
    ).toEqual([
      'view',
      '@karmaniverous/x-openclaw@1.0.0',
      'jeeves.a',
      '--json',
    ]);
    expect(pluginsInspectAllArgs()).toEqual([
      'plugins',
      'inspect',
      '--all',
      '--json',
    ]);
  });

  it('passes a config batch as a file, never inline', () => {
    expect(configSetBatchFileArgs('/tmp/x/batch.json')).toEqual([
      'config',
      'set',
      '--batch-file',
      '/tmp/x/batch.json',
    ]);
    const payload = configBatchPayload([
      { path: 'plugins.entries.a.hooks.allowConversationAccess', value: true },
    ]);
    expect(JSON.parse(payload)).toEqual([
      { path: 'plugins.entries.a.hooks.allowConversationAccess', value: true },
    ]);
  });

  it('refuses an empty batch', () => {
    expect(() => configBatchPayload([])).toThrow(/empty/);
  });

  it.each(['plugins.installs', 'plugins.installs.jeeves-watcher-openclaw'])(
    'never writes %s',
    (path) => {
      expect(() => {
        assertWritablePath(path);
      }).toThrow(/retired/);
      expect(() => configBatchPayload([{ path, value: {} }])).toThrow(
        /retired/,
      );
      expect(() => configUnsetArgs(path)).toThrow(/retired/);
    },
  );

  it('allows ordinary plugin paths', () => {
    expect(configUnsetArgs('plugins.entries.x')).toEqual([
      'config',
      'unset',
      'plugins.entries.x',
    ]);
    expect(() => {
      assertWritablePath('plugins.installsX');
    }).not.toThrow();
  });
});
