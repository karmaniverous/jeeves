import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
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

  it('retries on EPERM and succeeds on second attempt', () => {
    const filePath = join(testDir, 'target.txt');
    writeFileSync(filePath, 'original');

    let callCount = 0;

    vi.mocked(renameSync).mockImplementation(((
      src: Parameters<typeof renameSync>[0],
      dest: Parameters<typeof renameSync>[1],
    ) => {
      callCount++;
      if (callCount === 1) {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      }
      // Restore and call real implementation
      vi.mocked(renameSync).mockRestore();
      renameSync(src, dest);
    }) as typeof renameSync);

    atomicWrite(filePath, 'new content');
    expect(callCount).toBe(2);
    expect(readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  it('gives up after max retries and cleans up temp file', () => {
    const filePath = join(testDir, 'target.txt');
    writeFileSync(filePath, 'original');

    const renamedTemps: string[] = [];
    vi.mocked(renameSync).mockImplementation(((
      src: Parameters<typeof renameSync>[0],
    ) => {
      renamedTemps.push(String(src));
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    }) as typeof renameSync);

    expect(() => {
      atomicWrite(filePath, 'new content');
    }).toThrow('EPERM');

    // Temp file should have been cleaned up
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
