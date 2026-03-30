/**
 * Shared file I/O helpers for managed section operations.
 *
 * @remarks
 * Extracts the atomic write pattern and file-level locking into
 * reusable utilities, eliminating duplication between
 * `updateManagedSection` and `removeManagedSection`.
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { lock } from 'proper-lockfile';

import { CORE_VERSION } from '../constants/version.js';

/** Stale lock threshold in ms (2 minutes). */
export const STALE_LOCK_MS = 120_000;

/** Default core version when none provided. */
export const DEFAULT_CORE_VERSION = CORE_VERSION;

/** Lock retry options. */
const LOCK_RETRIES = { retries: 5, minTimeout: 100, maxTimeout: 1000 };

/**
 * Write content to a file atomically via a temp file + rename.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - Content to write.
 */
export function atomicWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.${String(Date.now())}.tmp`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
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
