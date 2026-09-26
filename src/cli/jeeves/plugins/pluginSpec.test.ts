import { describe, expect, it } from 'vitest';

import {
  defaultPluginTargets,
  isJeevesPluginId,
  parsePluginSpec,
  parsePluginSpecs,
} from './pluginSpec.js';

describe('parsePluginSpec', () => {
  it.each([
    ['watcher', 'jeeves-watcher-openclaw', 'latest'],
    ['watcher@0.16.0', 'jeeves-watcher-openclaw', '0.16.0'],
    ['jeeves-runner-openclaw', 'jeeves-runner-openclaw', 'latest'],
    ['jeeves-runner-openclaw@^1', 'jeeves-runner-openclaw', '^1'],
    ['@karmaniverous/jeeves-meta-openclaw', 'jeeves-meta-openclaw', 'latest'],
    [
      '@karmaniverous/jeeves-meta-openclaw@1.0.0-rc.1',
      'jeeves-meta-openclaw',
      '1.0.0-rc.1',
    ],
    ['@karmaniverous/jeeves-openclaw@next', 'jeeves-openclaw', 'next'],
  ])('%s → %s@%s', (input, pluginId, range) => {
    expect(parsePluginSpec(input)).toEqual({
      packageName: `@karmaniverous/${pluginId}`,
      pluginId,
      range,
    });
  });

  it.each([
    '@karmaniverous/jeeves-watcher',
    '@someone/jeeves-watcher-openclaw',
    'memory-core',
    'openclaw@1.0.0-beta',
    '../evil',
    'Watcher',
    'watcher@',
    '',
  ])('rejects %j', (input) => {
    expect(() => parsePluginSpec(input)).toThrow(
      /Not a Jeeves OpenClaw plugin/,
    );
  });
});

describe('parsePluginSpecs', () => {
  it('rejects the same plugin twice', () => {
    expect(() =>
      parsePluginSpecs(['watcher', 'jeeves-watcher-openclaw@1']),
    ).toThrow(/more than once/);
  });
});

describe('defaultPluginTargets', () => {
  it('targets the four platform component plugins at latest', () => {
    expect(
      defaultPluginTargets().map((t) => `${t.pluginId}@${t.range}`),
    ).toEqual([
      'jeeves-runner-openclaw@latest',
      'jeeves-watcher-openclaw@latest',
      'jeeves-server-openclaw@latest',
      'jeeves-meta-openclaw@latest',
    ]);
  });
});

describe('isJeevesPluginId', () => {
  it.each([
    ['jeeves-watcher-openclaw', true],
    ['jeeves-openclaw', true],
    ['memory-core', false],
    ['jeeves-watcher', false],
  ])('%s → %s', (id, expected) => {
    expect(isJeevesPluginId(id)).toBe(expected);
  });
});
