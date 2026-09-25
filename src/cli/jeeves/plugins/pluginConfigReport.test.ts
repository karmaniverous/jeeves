import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describePluginConfig,
  generatedSecretNotices,
} from './pluginConfigReport.js';
import type { PluginConfigResolution } from './pluginConfigResolve.js';

const S = 'jeeves-server-openclaw';
const SEED = 'a'.repeat(64);

const resolution: PluginConfigResolution = {
  ops: [],
  secrets: [SEED],
  unknownPluginIds: ['jeeves-future-openclaw'],
  values: [
    {
      pluginId: S,
      key: 'configRoot',
      value: '/cfg',
      source: 'option',
      secret: false,
      write: true,
    },
    {
      pluginId: S,
      key: 'pluginKey',
      value: SEED,
      source: 'generated',
      secret: true,
      write: true,
    },
    {
      pluginId: S,
      key: 'apiUrl',
      value: 'http://x',
      source: 'existing',
      secret: false,
      write: false,
    },
  ],
};

describe('describePluginConfig', () => {
  it('lists values with provenance and redacts secrets', () => {
    const lines = describePluginConfig(resolution);
    expect(lines).toEqual([
      'Plugin config:',
      `  ${S}.configRoot = "/cfg" (option; write)`,
      `  ${S}.pluginKey = <redacted> (generated; write)`,
      `  ${S}.apiUrl = "http://x" (existing; keep)`,
      '  jeeves-future-openclaw: no known config schema; config left unchanged',
    ]);
    expect(lines.join('\n')).not.toContain(SEED);
  });

  it('prints nothing for an empty resolution', () => {
    expect(
      describePluginConfig({
        ops: [],
        values: [],
        secrets: [],
        unknownPluginIds: [],
      }),
    ).toEqual([]);
  });
});

describe('generatedSecretNotices', () => {
  it('tells the operator to mirror a generated key into the server config', () => {
    const [notice] = generatedSecretNotices(resolution);
    expect(notice).toContain(join('/cfg', 'jeeves-server', 'config.json'));
    expect(notice).toContain('keys._plugin');
    expect(notice).not.toContain(SEED);
  });
});
