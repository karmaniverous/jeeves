import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const mod = actual as Record<string, unknown>;
  return Object.assign({}, mod, {
    renameSync: vi.fn(mod['renameSync'] as typeof renameSync),
  });
});

import { atomicWrite } from './fileOps.js';

describe('atomicWrite', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-fileops-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writes content to target file', () => {
    const filePath = join(testDir, 'target.txt');
    atomicWrite(filePath, 'hello world');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it.skipIf(process.platform === 'win32')(
    'applies the requested mode to the written file',
    () => {
      const filePath = join(testDir, 'secret.json');
      writeFileSync(filePath, 'original', { mode: 0o644 });
      atomicWrite(filePath, 'new', { mode: 0o600 });
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
      expect(readFileSync(filePath, 'utf-8')).toBe('new');
    },
  );

  it('writes content when a mode is requested', () => {
    const filePath = join(testDir, 'target.txt');
    atomicWrite(filePath, 'with mode', { mode: 0o666 });
    expect(readFileSync(filePath, 'utf-8')).toBe('with mode');
  });

  it('retries on EPERM and succeeds on second attempt', () => {
    const filePath = join(testDir, 'target.txt');
    writeFileSync(filePath, 'original');

    let callCount = 0;

    vi.mocked(renameSync).mockImplementation(
      (src: Parameters<typeof renameSync>[0], dest) => {
        callCount++;
        if (callCount === 1) {
          throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
        }
        vi.mocked(renameSync).mockRestore();
        renameSync(src, dest);
      },
    );

    atomicWrite(filePath, 'new content');
    expect(callCount).toBe(2);
    expect(readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  it('gives up after max retries and cleans up temp file', () => {
    const filePath = join(testDir, 'target.txt');
    writeFileSync(filePath, 'original');

    const renamedTemps: string[] = [];
    vi.mocked(renameSync).mockImplementation(
      (src: Parameters<typeof renameSync>[0]) => {
        renamedTemps.push(String(src));
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      },
    );

    expect(() => {
      atomicWrite(filePath, 'new content');
    }).toThrow('EPERM');

    for (const tempPath of renamedTemps) {
      expect(existsSync(tempPath)).toBe(false);
    }
  });

  it('does not retry on non-EPERM errors', () => {
    const filePath = join(testDir, 'target.txt');
    writeFileSync(filePath, 'original');

    let callCount = 0;
    vi.mocked(renameSync).mockImplementation(() => {
      callCount++;
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    expect(() => {
      atomicWrite(filePath, 'new content');
    }).toThrow('EACCES');
    expect(callCount).toBe(1);
  });
});
