import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STALE_LOCK_MS, withFileLock, withWorkspaceLock } from './fileOps.js';

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

  it('recovers a stale workspace lock', async () => {
    vi.useFakeTimers();
    const lockFile = join(testDir, 'target.txt');
    writeFileSync(lockFile, '');
    let releaseFileLock: (() => void) | undefined;

    const heldLock = withFileLock(lockFile, async () => {
      await new Promise<void>((resolve) => {
        releaseFileLock = resolve;
      });
    });

    await vi.waitFor(() => {
      expect(releaseFileLock).toBeTypeOf('function');
    });

    const lockAttempt = withWorkspaceLock(testDir, vi.fn());
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(STALE_LOCK_MS + 1000);
    releaseFileLock?.();
    await heldLock;
    await lockAttempt;
  });
});
