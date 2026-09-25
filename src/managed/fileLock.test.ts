import { existsSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTempDir } from '../test/tempDir.js';
import { withFileLock } from './fileLock.js';

describe('withFileLock', () => {
  let testDir: string;
  let target: string;

  const tempDir = useTempDir('jeeves-filelock-');
  beforeEach(() => {
    testDir = tempDir();
    target = join(testDir, 'config.json');
  });

  it('runs fn and releases the lock', async () => {
    const fn = vi.fn();
    await withFileLock(target, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(existsSync(`${target}.lock`)).toBe(false);
    await withFileLock(target, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not require the target file to exist', async () => {
    const fn = vi.fn();
    await withFileLock(join(testDir, 'missing.json'), fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fails fast with ELOCKED while held', async () => {
    let release: (() => void) | undefined;
    const outer = withFileLock(target, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await vi.waitFor(() => {
      expect(release).toBeTypeOf('function');
    });

    const fn = vi.fn();
    await expect(withFileLock(target, fn)).rejects.toMatchObject({
      code: 'ELOCKED',
    });
    expect(fn).not.toHaveBeenCalled();

    release?.();
    await outer;
    await withFileLock(target, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('releases the lock when fn throws', async () => {
    await expect(
      withFileLock(target, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('takes over a stale lock', async () => {
    const lockPath = `${target}.lock`;
    mkdirSync(lockPath);
    const old = new Date(Date.now() - 10_000);
    utimesSync(lockPath, old, old);

    const fn = vi.fn();
    await withFileLock(target, fn, 1_000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('propagates an unexpected lock error without running fn', async () => {
    const fn = vi.fn();
    await expect(
      withFileLock(join(testDir, 'no-such-dir', 'config.json'), fn),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('respects a fresh lock held by another process', async () => {
    mkdirSync(`${target}.lock`);
    await expect(withFileLock(target, vi.fn())).rejects.toMatchObject({
      code: 'ELOCKED',
    });
  });
});
