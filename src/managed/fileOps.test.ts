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

import { atomicWrite, withWorkspaceLock } from './fileOps.js';

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

describe('withWorkspaceLock', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `jeeves-fileops-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('executes fn and releases lock when workspace lock is free', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    await withWorkspaceLock(testDir, fn);
    await withWorkspaceLock(testDir, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns silently without executing fn when workspace lock is held', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    let releaseOuter: (() => void) | undefined;

    const outer = withWorkspaceLock(testDir, async () => {
      await new Promise<void>((resolve) => {
        releaseOuter = resolve;
      });
    });

    await vi.waitFor(() => {
      expect(releaseOuter).toBeTypeOf('function');
    });
    await withWorkspaceLock(testDir, fn);

    expect(fn).not.toHaveBeenCalled();

    releaseOuter?.();
    await outer;
  });

  it('recovers after the lock is released', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    let releaseOuter: (() => void) | undefined;

    const outer = withWorkspaceLock(testDir, async () => {
      await new Promise<void>((resolve) => {
        releaseOuter = resolve;
      });
    });

    await vi.waitFor(() => {
      expect(releaseOuter).toBeTypeOf('function');
    });
    await withWorkspaceLock(testDir, fn);
    expect(fn).not.toHaveBeenCalled();

    releaseOuter?.();
    await outer;

    await withWorkspaceLock(testDir, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('creates the workspace lock file if missing', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    await withWorkspaceLock(testDir, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(existsSync(join(testDir, 'jeeves.lock'))).toBe(true);
  });
});
