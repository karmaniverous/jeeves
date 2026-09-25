import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readServerPluginKey, serverConfigPath } from './serverPluginKey.js';

const reader = (text: string | undefined) => (path: string) =>
  path === join('/cfg', 'jeeves-server', 'config.json') ? text : undefined;

describe('readServerPluginKey', () => {
  it.each([
    ['a string entry', '{"keys":{"_plugin":"seed1"}}', 'seed1'],
    ['an object entry', '{"keys":{"_plugin":{"key":"seed2"}}}', 'seed2'],
    ['no _plugin key', '{"keys":{"other":"x"}}', undefined],
    ['no keys', '{"port":1934}', undefined],
    ['an env placeholder', '{"keys":{"_plugin":"${SEED}"}}', undefined],
    ['invalid JSON', '{nope', undefined],
    ['a wrong shape', '{"keys":{"_plugin":42}}', undefined],
  ])('reads %s', (_label, text, expected) => {
    expect(readServerPluginKey(reader(text), '/cfg')).toBe(expected);
  });

  it('returns undefined when the file is missing', () => {
    expect(readServerPluginKey(reader(undefined), '/cfg')).toBeUndefined();
  });

  it('builds the conventional path', () => {
    expect(serverConfigPath('/cfg')).toBe(
      join('/cfg', 'jeeves-server', 'config.json'),
    );
  });
});
