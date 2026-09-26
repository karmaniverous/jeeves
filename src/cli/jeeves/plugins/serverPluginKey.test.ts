import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseServerKeyState,
  readServerKeyState,
  serverConfigPath,
} from './serverPluginKey.js';

describe('parseServerKeyState', () => {
  it.each([
    [
      'a string entry',
      '{"keys":{"_plugin":"seed1"}}',
      { kind: 'literal', value: 'seed1' },
    ],
    [
      'an object entry',
      '{"keys":{"_plugin":{"key":"seed2"}}}',
      { kind: 'literal', value: 'seed2' },
    ],
    ['no _plugin key', '{"keys":{"other":"x"}}', { kind: 'absent' }],
    ['no keys', '{"port":1934}', { kind: 'absent' }],
    ['an empty seed', '{"keys":{"_plugin":""}}', { kind: 'absent' }],
    [
      'an env placeholder',
      '{"keys":{"_plugin":"${SEED}"}}',
      { kind: 'opaque' },
    ],
    ['a wrong shape', '{"keys":{"_plugin":42}}', { kind: 'opaque' }],
    ['a non-object keys', '{"keys":"x"}', { kind: 'opaque' }],
    ['invalid JSON', '{nope', { kind: 'unreadable' }],
    ['a non-object', '[1]', { kind: 'unreadable' }],
  ])('classifies %s', (_label, text, expected) => {
    expect(parseServerKeyState(text)).toEqual(expected);
  });

  it('reports a missing file', () => {
    expect(parseServerKeyState(undefined)).toEqual({ kind: 'noFile' });
  });
});

describe('readServerKeyState', () => {
  it('reads the conventional path', () => {
    const seen: string[] = [];
    const state = readServerKeyState((p) => {
      seen.push(p);
      return '{"keys":{"_plugin":"s"}}';
    }, '/cfg');
    expect(seen).toEqual([join('/cfg', 'jeeves-server', 'config.json')]);
    expect(state).toEqual({ kind: 'literal', value: 's' });
    expect(serverConfigPath('/cfg')).toBe(seen[0]);
  });
});
