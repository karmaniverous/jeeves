import { describe, expect, it } from 'vitest';

import { pluginConfigCliOptionsSchema } from './pluginConfigInput.js';
import {
  componentOf,
  inputValue,
  optionKey,
  PLUGIN_CONFIG_FIELDS,
  PLUGIN_OPTION_FIELDS,
  pluginConfigInputSchema,
} from './pluginConfigSchema.js';

describe('PLUGIN_CONFIG_FIELDS', () => {
  it('requires configRoot for every plugin and marks only pluginKey secret', () => {
    for (const fields of Object.values(PLUGIN_CONFIG_FIELDS)) {
      expect(fields[0]).toMatchObject({ key: 'configRoot', required: true });
    }
    const secrets = Object.values(PLUGIN_CONFIG_FIELDS)
      .flat()
      .filter((f) => f.secret)
      .map((f) => f.option);
    expect(secrets).toEqual(['--server-plugin-key']);
  });
});

describe('descriptor table consistency', () => {
  it('has one CLI options schema key per per-plugin option', () => {
    expect(
      PLUGIN_OPTION_FIELDS.map(({ field }) => optionKey(field.option)).sort(),
    ).toEqual(Object.keys(pluginConfigCliOptionsSchema.shape).sort());
  });

  it('accepts every registered key in the config input schema', () => {
    for (const [component, fields] of Object.entries(PLUGIN_CONFIG_FIELDS)) {
      const input = Object.fromEntries(
        fields
          .filter((f) => f.key !== 'configRoot')
          .map((f) => [f.key, f.key === 'apiUrl' ? 'http://h:1' : 'v']),
      );
      expect(
        pluginConfigInputSchema.safeParse({ [component]: input }).success,
      ).toBe(true);
    }
  });

  it('lists the per-plugin options in help order', () => {
    expect(PLUGIN_OPTION_FIELDS.map(({ field }) => field.option)).toEqual([
      '--runner-api-url',
      '--watcher-api-url',
      '--server-api-url',
      '--server-plugin-key',
      '--meta-api-url',
    ]);
  });

  it.each([
    ['--runner-api-url', 'runnerApiUrl'],
    ['--server-plugin-key', 'serverPluginKey'],
  ])('optionKey(%s) → %s', (option, key) => {
    expect(optionKey(option)).toBe(key);
  });
});

describe('componentOf', () => {
  it.each([
    ['jeeves-watcher-openclaw', 'watcher'],
    ['jeeves-meta-openclaw', 'meta'],
    ['jeeves-future-openclaw', undefined],
    ['memory-core', undefined],
  ])('%s → %s', (id, expected) => {
    expect(componentOf(id)).toBe(expected);
  });
});

describe('inputValue', () => {
  const input = pluginConfigInputSchema.parse({
    configRoot: '/c',
    server: { pluginKey: 'k' },
  });

  it('reads shared and per-component values', () => {
    expect(inputValue(input, 'runner', 'configRoot')).toBe('/c');
    expect(inputValue(input, 'server', 'pluginKey')).toBe('k');
    expect(inputValue(input, 'server', 'apiUrl')).toBeUndefined();
    expect(inputValue(input, 'meta', 'apiUrl')).toBeUndefined();
  });
});
