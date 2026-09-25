import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  backupPath,
  createServerConfigWriter,
  detectFormatting,
  setPluginKeyInText,
} from './serverConfigWrite.js';

const NOW = new Date('2026-09-25T11:22:33.456Z');
const SEED = 'feed'.repeat(16);

describe('setPluginKeyInText', () => {
  it.each([
    [
      'adds keys._plugin, keeping order, indent and final newline',
      '{\n    "port": 1934,\n    "keys": {\n        "alice": "a"\n    }\n}\n',
      '{\n    "port": 1934,\n    "keys": {\n        "alice": "a",\n        "_plugin": "S"\n    }\n}\n',
    ],
    [
      'adds a keys object when there is none',
      '{\n  "port": 1934\n}',
      '{\n  "port": 1934,\n  "keys": {\n    "_plugin": "S"\n  }\n}',
    ],
    [
      'replaces a string entry in place, keeping CRLF',
      '{\r\n\t"keys": {\r\n\t\t"_plugin": "old",\r\n\t\t"z": "z"\r\n\t}\r\n}\r\n',
      '{\r\n\t"keys": {\r\n\t\t"_plugin": "S",\r\n\t\t"z": "z"\r\n\t}\r\n}\r\n',
    ],
    [
      'sets key of an object entry, keeping its other fields',
      '{"keys":{"_plugin":{"key":"","scopes":["/a"]}}}',
      '{"keys":{"_plugin":{"key":"S","scopes":["/a"]}}}',
    ],
  ])('%s', (_label, before, after) => {
    expect(setPluginKeyInText(before, 'S')).toBe(after);
  });

  it('keeps hand-written layout and number spelling byte for byte', () => {
    const before =
      '{\n  "port": 1934, "ratio": 1.0,\n  "roots": ["/a", "/b"],\n  "keys": { "_plugin": "old", "z": "z" }\n}\n';
    expect(setPluginKeyInText(before, 'S')).toBe(
      before.replace('"old"', '"S"'),
    );
  });

  it('rejects a commented file (jeeves-server could not read it either)', () => {
    const before = '{\n  // note\n  "keys": {\n    "_plugin": "old"\n  }\n}';
    expect(() => setPluginKeyInText(before, 'S')).toThrow();
  });

  it.each([
    ['a non-object document', '[1]', 'not a JSON object'],
    ['a non-object keys', '{"keys":"x"}', '"keys" is not an object'],
  ])('rejects %s', (_label, text, message) => {
    expect(() => setPluginKeyInText(text, 'S')).toThrow(message);
  });
});

describe('detectFormatting / backupPath', () => {
  it('detects indentation and line endings', () => {
    expect(detectFormatting('{"a":1}')).toEqual({
      insertSpaces: true,
      tabSize: 2,
      eol: '\n',
    });
    expect(detectFormatting('{\r\n\t"a": 1\r\n}')).toEqual({
      insertSpaces: false,
      tabSize: 1,
      eol: '\r\n',
    });
    expect(detectFormatting('{\n    "a": 1\n}')).toMatchObject({ tabSize: 4 });
  });

  it('builds a timestamped sibling path', () => {
    expect(backupPath('/x/config.json', NOW)).toBe(
      '/x/config.json.bak-20260925T112233456Z',
    );
  });
});

describe('createServerConfigWriter (real files in a temp dir)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = join(
      tmpdir(),
      `jeeves-srvcfg-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(dir, { recursive: true });
    file = join(dir, 'config.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writer = createServerConfigWriter(undefined, () => NOW);

  it('backs up, then writes only keys._plugin atomically', async () => {
    const original = JSON.stringify({ port: 1934, keys: { a: 'b' } }, null, 2);
    writeFileSync(file, original, { mode: 0o600 });
    const backup = await writer({
      path: file,
      value: SEED,
      expect: { kind: 'absent' },
    });
    expect(backup).toBe(backupPath(file, NOW));
    expect(readFileSync(backup, 'utf-8')).toBe(original);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({
      port: 1934,
      keys: { a: 'b', _plugin: SEED },
    });
    // No temp file or lock left behind.
    expect(readdirSync(dir).sort()).toEqual(
      ['config.json', `config.json.bak-20260925T112233456Z`].sort(),
    );
  });

  it.skipIf(process.platform === 'win32')('keeps the file mode', async () => {
    writeFileSync(file, '{}', { mode: 0o600 });
    await writer({ path: file, value: SEED, expect: { kind: 'absent' } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('replaces the expected literal', async () => {
    writeFileSync(file, '{"keys":{"_plugin":"old"}}');
    await writer({
      path: file,
      value: SEED,
      expect: { kind: 'literal', value: 'old' },
    });
    expect(readFileSync(file, 'utf-8')).toBe(`{"keys":{"_plugin":"${SEED}"}}`);
  });

  it('writes nothing when the file changed since the plan', async () => {
    const text = '{"keys":{"_plugin":"someone-else"}}';
    writeFileSync(file, text);
    await expect(
      writer({ path: file, value: SEED, expect: { kind: 'absent' } }),
    ).rejects.toThrow('changed since the plan');
    expect(readFileSync(file, 'utf-8')).toBe(text);
    expect(readdirSync(dir)).toEqual(['config.json']);
  });

  it('writes nothing while another holder has the lock', async () => {
    writeFileSync(file, '{}');
    mkdirSync(`${file}.lock`);
    await expect(
      writer({ path: file, value: SEED, expect: { kind: 'absent' } }),
    ).rejects.toThrow(/already being held/);
    expect(readFileSync(file, 'utf-8')).toBe('{}');
  });

  it('refuses to overwrite an existing backup', async () => {
    writeFileSync(file, '{}');
    writeFileSync(backupPath(file, NOW), 'earlier backup');
    await expect(
      writer({ path: file, value: SEED, expect: { kind: 'absent' } }),
    ).rejects.toThrow();
    expect(readFileSync(file, 'utf-8')).toBe('{}');
    expect(readFileSync(backupPath(file, NOW), 'utf-8')).toBe('earlier backup');
  });
});
