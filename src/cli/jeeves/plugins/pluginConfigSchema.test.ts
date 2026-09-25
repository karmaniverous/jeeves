import { describe, expect, it } from 'vitest';

import {
  componentOf,
  inputValue,
  PLUGIN_CONFIG_FIELDS,
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
