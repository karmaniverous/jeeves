import { Command } from '@commander-js/extra-typings';
import { describe, expect, it } from 'vitest';

import { addPluginOptions, pluginCliOptionsSchema } from './pluginConfigCli.js';

describe('addPluginOptions', () => {
  it('registers the shared plugin options in help order', () => {
    const command = new Command();
    addPluginOptions(command);
    expect(command.options.map((o) => o.flags)).toEqual([
      '-w, --workspace <path>',
      '-c, --config-root <path>',
      '--runner-api-url <url>',
      '--watcher-api-url <url>',
      '--server-api-url <url>',
      '--server-plugin-key <seed>',
      '--meta-api-url <url>',
      '--plugin-config <file>',
      '--force-reinstall',
    ]);
    expect(
      command.options.find((o) => o.long === '--watcher-api-url')?.description,
    ).toBe('jeeves-watcher plugin apiUrl');
  });

  it('parses back into the options schema', () => {
    const command = new Command().exitOverride();
    addPluginOptions(command);
    command.parse(
      [
        '--server-plugin-key',
        'k',
        '--meta-api-url',
        'http://m:1',
        '--force-reinstall',
      ],
      { from: 'user' },
    );
    expect(pluginCliOptionsSchema.parse(command.opts())).toEqual({
      serverPluginKey: 'k',
      metaApiUrl: 'http://m:1',
      forceReinstall: true,
    });
  });
});
