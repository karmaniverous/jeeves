/**
 * Tests for client fs-utils.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendJsonl,
  ensureDir,
  getArg,
  loadEnvFile,
  nowIso,
  parseArgs,
  readJson,
  readJsonl,
  uuid,
  writeJsonAtomic,
  writeJsonl,
} from './fs-utils.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-client-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('nowIso', () => {
  it('returns a valid ISO string', () => {
    const result = nowIso();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

describe('uuid', () => {
  it('returns a valid UUID', () => {
    const result = uuid();
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('ensureDir', () => {
  it('creates nested directories', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c');
    ensureDir(nested);
    expect(fs.existsSync(nested)).toBe(true);
  });
});

describe('readJson / writeJsonAtomic', () => {
  it('round-trips JSON data', () => {
    const data = { key: 'value', num: 42 };
    const p = path.join(tmpDir, 'test.json');
    writeJsonAtomic(p, data);
    const result = readJson(p, null);
    expect(result).toEqual(data);
  });

  it('returns fallback for missing files', () => {
    const result = readJson(path.join(tmpDir, 'missing.json'), { def: true });
    expect(result).toEqual({ def: true });
  });

  it('creates parent directories', () => {
    const p = path.join(tmpDir, 'nested', 'dir', 'file.json');
    writeJsonAtomic(p, { ok: true });
    expect(readJson(p, null)).toEqual({ ok: true });
  });
});

describe('appendJsonl / readJsonl / writeJsonl', () => {
  it('appends and reads JSONL entries', () => {
    const p = path.join(tmpDir, 'test.jsonl');
    appendJsonl(p, { a: 1 });
    appendJsonl(p, { b: 2 });
    const result = readJsonl(p);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('writeJsonl overwrites content', () => {
    const p = path.join(tmpDir, 'test.jsonl');
    writeJsonl(p, [{ x: 1 }, { y: 2 }]);
    const result = readJsonl(p);
    expect(result).toEqual([{ x: 1 }, { y: 2 }]);
  });

  it('readJsonl returns empty array for missing file', () => {
    const result = readJsonl(path.join(tmpDir, 'missing.jsonl'));
    expect(result).toEqual([]);
  });
});

describe('loadEnvFile', () => {
  it('loads key=value pairs into process.env', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envPath,
      'TEST_KEY_JR=test_value\n# comment\nKEY2_JR=val2\n',
    );
    loadEnvFile(envPath);
    expect(process.env.TEST_KEY_JR).toBe('test_value');
    expect(process.env.KEY2_JR).toBe('val2');
    delete process.env.TEST_KEY_JR;
    delete process.env.KEY2_JR;
  });

  it('throws for missing file', () => {
    expect(() => {
      loadEnvFile(path.join(tmpDir, 'missing.env'));
    }).toThrow('Missing secret file');
  });
});

describe('parseArgs', () => {
  it('parses --key=value arguments', () => {
    const result = parseArgs(['--foo=bar', '--num=42']);
    expect(result).toEqual({ foo: 'bar', num: '42' });
  });

  it('ignores non-matching arguments', () => {
    const result = parseArgs(['plain', '-short', '--flag']);
    expect(result).toEqual({});
  });
});

describe('getArg', () => {
  it('returns value after named flag', () => {
    const argv = ['--count', '10', '--name', 'test'];
    expect(getArg(argv, '--count', '1')).toBe('10');
    expect(getArg(argv, '--name', '')).toBe('test');
  });

  it('returns default when flag is missing', () => {
    expect(getArg([], '--missing', 'default')).toBe('default');
  });
});
