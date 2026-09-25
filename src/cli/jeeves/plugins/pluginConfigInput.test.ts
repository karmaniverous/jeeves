import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadPluginConfigFile,
  pluginConfigFromOptions,
} from './pluginConfigInput.js';

describe('pluginConfigFromOptions', () => {
  it('collects only passed options into the input shape', () => {
    expect(
      pluginConfigFromOptions(
        { watcherApiUrl: 'http://127.0.0.1:2000', serverPluginKey: 'k' },
        'cfg',
      ),
    ).toEqual({
      configRoot: resolve('cfg'),
      watcher: { apiUrl: 'http://127.0.0.1:2000' },
      server: { pluginKey: 'k' },
    });
    expect(pluginConfigFromOptions({})).toEqual({});
  });

  it('rejects an invalid URL', () => {
    expect(() => pluginConfigFromOptions({ runnerApiUrl: 'nope' })).toThrow(
      /Invalid plugin config options[\s\S]*runner\.apiUrl/,
    );
  });
});

describe('loadPluginConfigFile', () => {
  const load = (text: string) => loadPluginConfigFile('p.json', () => text);

  it('validates and normalizes a file', () => {
    expect(
      load(
        JSON.stringify({
          $schema: 'x',
          configRoot: '/srv/cfg',
          meta: { apiUrl: 'https://meta.local' },
        }),
      ),
    ).toMatchObject({
      configRoot: resolve('/srv/cfg'),
      meta: { apiUrl: 'https://meta.local' },
    });
  });

  it('rejects keys the plugin schemas do not allow', () => {
    expect(() => load('{"watcher":{"pluginKey":"x"}}')).toThrow(
      /Invalid --plugin-config p\.json/,
    );
    expect(() => load('{"other":{}}')).toThrow(/Invalid --plugin-config/);
  });

  it('reports unreadable JSON', () => {
    expect(() => load('{nope')).toThrow(/Cannot read --plugin-config p\.json/);
  });
});
