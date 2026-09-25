import { describe, expect, it } from 'vitest';

import {
  decideServerPluginKey,
  type ServerKeyInput,
  ServerPluginKeyError,
} from './serverKeySync.js';
import type { ServerKeyState } from './serverPluginKey.js';

const PATH = '/cfg/jeeves-server/config.json';
const GEN = 'generated-seed';

const input = (
  server: ServerKeyState,
  over: Partial<ServerKeyInput> = {},
): ServerKeyInput => ({
  server,
  serverPath: PATH,
  generate: () => GEN,
  ...over,
});

const literal = (value: string): ServerKeyState => ({ kind: 'literal', value });
const absent: ServerKeyState = { kind: 'absent' };
const noFile: ServerKeyState = { kind: 'noFile' };
const opaque: ServerKeyState = { kind: 'opaque' };
const unreadable: ServerKeyState = { kind: 'unreadable' };
const option = (value: string) => ({ value, source: 'option' as const });

describe('decideServerPluginKey', () => {
  it.each([
    [
      'server key, no plugin key: plugin gets the server key',
      input(literal('s')),
      { value: 's', source: 'server config', writePlugin: true },
    ],
    [
      'same key both ends: nothing to write',
      input(literal('s'), { plugin: 's' }),
      { value: 's', source: 'existing', writePlugin: false },
    ],
    [
      'plugin key, server has none: copied into the server config',
      input(absent, { plugin: 'p' }),
      {
        value: 'p',
        source: 'existing',
        writePlugin: false,
        serverWrite: { path: PATH, value: 'p', expect: { kind: 'absent' } },
      },
    ],
    [
      'neither: generated and written to both ends',
      input(absent),
      {
        value: GEN,
        source: 'generated',
        writePlugin: true,
        serverWrite: { path: PATH, value: GEN, expect: { kind: 'absent' } },
      },
    ],
    [
      'conflict resolved by --server-plugin-key: both ends',
      input(literal('s'), { plugin: 'p', explicit: option('x') }),
      {
        value: 'x',
        source: 'option',
        writePlugin: true,
        serverWrite: {
          path: PATH,
          value: 'x',
          expect: { kind: 'literal', value: 's' },
        },
      },
    ],
    [
      'explicit key equal to both ends: nothing to write',
      input(literal('x'), { plugin: 'x', explicit: option('x') }),
      { value: 'x', source: 'option', writePlugin: false },
    ],
    [
      'explicit key from --plugin-config, server has none',
      input(absent, { explicit: { value: 'f', source: 'file' } }),
      {
        value: 'f',
        source: 'file',
        writePlugin: true,
        serverWrite: { path: PATH, value: 'f', expect: { kind: 'absent' } },
      },
    ],
  ] as const)('%s', (_label, given, expected) => {
    expect(decideServerPluginKey(given)).toEqual(expected);
  });

  it.each([
    ['no server config', noFile, 'not found'],
    ['a non-literal keys._plugin', opaque, 'not a literal seed'],
    ['an unparsable server config', unreadable, 'not a valid JSON object'],
  ])(
    'keeps the plugin key and warns with %s (server never written)',
    (_label, server, text) => {
      const d = decideServerPluginKey(input(server, { plugin: 'p' }));
      expect(d).toMatchObject({ value: 'p', writePlugin: false });
      expect(d.serverWrite).toBeUndefined();
      expect(d.warning).toContain(text);
    },
  );

  it.each([
    ['no server config', noFile],
    ['a non-literal keys._plugin', opaque],
  ])('writes an explicit key to the plugin only with %s, warning', (_l, s) => {
    const d = decideServerPluginKey(input(s, { explicit: option('x') }));
    expect(d).toMatchObject({ value: 'x', writePlugin: true });
    expect(d.serverWrite).toBeUndefined();
    expect(d.warning).toContain(PATH);
  });

  it('names the server config generically when configRoot is unknown', () => {
    const d = decideServerPluginKey(
      input(noFile, { plugin: 'p', serverPath: undefined }),
    );
    expect(d.warning).toBe(
      'the jeeves-server config (configRoot unknown) not found; only the plugin side was set. Set keys._plugin there to the same seed, then restart jeeves-server.',
    );
  });

  it.each([
    ['no server config', noFile, /not found/],
    ['a non-literal keys._plugin', opaque, /not a literal seed/],
    ['an unparsable server config', unreadable, /not a valid JSON object/],
  ])(
    'fails instead of generating a key it cannot sync with %s',
    (_l, server, message) => {
      const run = () =>
        decideServerPluginKey(
          input(server, {
            generate: () => {
              throw new Error('must not generate');
            },
          }),
        );
      expect(run).toThrow(ServerPluginKeyError);
      expect(run).toThrow(message);
    },
  );

  it('fails on an unparsable server config even with an explicit key', () => {
    expect(() =>
      decideServerPluginKey(input(unreadable, { explicit: option('x') })),
    ).toThrow(ServerPluginKeyError);
  });

  it('fails when both ends have different keys, without naming either', () => {
    const run = () =>
      decideServerPluginKey(
        input(literal('SRV_SEED_1'), { plugin: 'PLG_SEED_2' }),
      );
    expect(run).toThrow(ServerPluginKeyError);
    expect(run).toThrow(/--server-plugin-key/);
    expect(run).not.toThrow(/SRV_SEED_1|PLG_SEED_2/);
  });

  it('never writes the server end without a path', () => {
    const d = decideServerPluginKey(
      input(absent, { plugin: 'p', serverPath: undefined }),
    );
    expect(d.serverWrite).toBeUndefined();
  });
});
