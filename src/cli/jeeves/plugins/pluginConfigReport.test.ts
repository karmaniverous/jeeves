import { describe, expect, it } from 'vitest';

import {
  describePluginConfig,
  pluginConfigNotices,
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

describe('server key lines and notices', () => {
  const withServer: PluginConfigResolution = {
    ...resolution,
    unknownPluginIds: [],
    serverKeyWrite: {
      path: '/cfg/jeeves-server/config.json',
      value: SEED,
      expect: { kind: 'absent' },
    },
    warnings: ['something to check'],
  };

  it('describes the planned server write and warnings, redacted', () => {
    const lines = describePluginConfig(withServer);
    expect(lines.slice(-2)).toEqual([
      '  jeeves-server keys._plugin = <redacted> (/cfg/jeeves-server/config.json; currently unset; write)',
      '  warning: something to check',
    ]);
    expect(lines.join('\n')).not.toContain(SEED);
  });

  it('repeats warnings and adds the restart notice only after a live write', () => {
    expect(pluginConfigNotices(withServer, true)).toEqual([
      'Warning: something to check',
    ]);
    const live = pluginConfigNotices(withServer, false);
    expect(live).toHaveLength(2);
    expect(live[1]).toContain('Restart jeeves-server');
    expect(live.join('\n')).not.toContain(SEED);
    expect(pluginConfigNotices(resolution, false)).toEqual([]);
  });
});
