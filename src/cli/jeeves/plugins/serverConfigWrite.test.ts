import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { useTempDir } from '../../../test/tempDir.js';
import {
  backupPath,
  createServerConfigWriter,
  detectIndent,
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

  it('rejects a non-object document', () => {
    expect(() => setPluginKeyInText('[1]', 'S')).toThrow('not a JSON object');
  });
});

describe('detectIndent / backupPath', () => {
  it('detects indentation', () => {
    expect(detectIndent('{"a":1}')).toBe('');
    expect(detectIndent('{\n\t"a": 1\n}')).toBe('\t');
    expect(detectIndent('{\n   "a": 1\n}')).toBe('   ');
    // Multi-line but nothing indented: fall back to two spaces.
    expect(detectIndent('{\n"a": 1\n}')).toBe('  ');
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

  const tempDir = useTempDir('jeeves-srvcfg-');
  beforeEach(() => {
    dir = tempDir();
    file = join(dir, 'config.json');
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
