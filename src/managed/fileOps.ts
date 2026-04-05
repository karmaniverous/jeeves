/**
 * Shared file I/O helpers for managed section operations.
 *
 * @remarks
 * Extracts the atomic write pattern and file-level locking into
 * reusable utilities, eliminating duplication between
 * `updateManagedSection` and `removeManagedSection`.
 */

import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { lock } from 'proper-lockfile';

import { CORE_VERSION } from '../constants/version.js';

/** Stale lock threshold in ms (2 minutes). */
export const STALE_LOCK_MS = 120_000;

/** Default core version when none provided. */
export const DEFAULT_CORE_VERSION = CORE_VERSION;

/** Lock retry options. */
const LOCK_RETRIES = { retries: 5, minTimeout: 100, maxTimeout: 1000 };

/** Maximum rename retry attempts on EPERM. */
const ATOMIC_WRITE_MAX_RETRIES = 3;

/** Delay between EPERM retries in milliseconds. */
const ATOMIC_WRITE_RETRY_DELAY_MS = 100;

/**
 * Write content to a file atomically via a temp file + rename.
 *
 * @remarks
 * Retries the rename up to three times on EPERM (Windows file-handle
 * contention) with a 100 ms synchronous delay between attempts.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - Content to write.
 */
export function atomicWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const base = basename(filePath, '.md');
  const tempPath = join(
    dir,
    `.${base}.${String(Date.now())}.${randomUUID().slice(0, 8)}.tmp`,
  );
  writeFileSync(tempPath, content, 'utf-8');

  for (let attempt = 0; attempt < ATOMIC_WRITE_MAX_RETRIES; attempt++) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (err: unknown) {
      const isEperm =
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'EPERM';
      if (!isEperm || attempt === ATOMIC_WRITE_MAX_RETRIES - 1) {
        try {
          unlinkSync(tempPath);
        } catch {
          /* best-effort cleanup */
        }
        throw err;
      }
      // Synchronous sleep before retry (acceptable in atomic write context)
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        ATOMIC_WRITE_RETRY_DELAY_MS,
      );
    }
  }
}

/**
 * Execute a callback while holding a file lock.
 *
 * @remarks
 * Acquires a lock on the file, executes the callback, and releases
 * the lock in a finally block. The lock uses a 2-minute stale threshold
 * and retries up to 5 times.
 *
 * @param filePath - Absolute path to the file to lock.
 * @param fn - Async callback to execute while holding the lock.
 */
export async function withFileLock(
  filePath: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(filePath, {
      stale: STALE_LOCK_MS,
      retries: LOCK_RETRIES,
    });
    await fn();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Lock already released or file deleted — safe to ignore
      }
    }
  }
}
