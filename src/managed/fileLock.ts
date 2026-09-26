/**
 * Cross-process advisory file lock using an atomic `mkdir` of `{file}.lock`.
 *
 * @remarks
 * Replaces `proper-lockfile`, whose `signal-exit` dependency registered
 * process-level SIGINT/SIGTERM/... handlers at import time in every process
 * that loaded this library (including the OpenClaw gateway and CLI, via the
 * Jeeves plugins). This implementation registers no process handlers and
 * starts no timers, so it cannot keep a process alive.
 *
 * The lock directory name (`{file}.lock`) matches proper-lockfile's
 * convention, so v0.x holders and this implementation exclude each other
 * during a mixed-version rollout. A lock whose mtime is older than
 * {@link STALE_LOCK_MS} is considered abandoned and is taken over; takeovers
 * are serialised through a `{file}.lock.takeover` guard so a freshly
 * re-taken lock is never deleted. The lock's mtime is not refreshed while it
 * is held (that would need a timer), so callbacks must finish well within
 * the stale threshold: they are meant to be a short read-modify-write.
 *
 * @module
 */

import { mkdirSync, rmSync, statSync } from 'node:fs';

import { getErrorCode } from '../utils.js';

/** Stale lock threshold in ms (2 minutes). */
export const STALE_LOCK_MS = 120_000;

/** Error thrown when a lock is held by another holder. */
class FileLockedError extends Error {
  /** Node-style error code, compatible with proper-lockfile's `ELOCKED`. */
  readonly code = 'ELOCKED';

  constructor(filePath: string) {
    super(`Lock file is already being held: ${filePath}`);
    this.name = 'FileLockedError';
  }
}

/**
 * Age of a lock directory in ms, or `undefined` when it does not exist.
 *
 * @param lockPath - Lock directory path.
 * @returns Milliseconds since the directory's mtime.
 */
function lockAgeMs(lockPath: string): number | undefined {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch (err: unknown) {
    if (getErrorCode(err) === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Take over a stale lock, serialised through the `{lock}.takeover` guard.
 *
 * @remarks
 * Holding the guard, the lock's age is re-checked before it is removed and
 * re-created, so a lock that another process freshly took (after our first
 * `stat`) is never deleted. A guard left behind by a crash is removed once
 * it is itself stale; that attempt still reports the lock as held.
 *
 * @param lockPath - Lock directory path.
 * @param staleMs - Stale threshold in ms.
 * @returns `true` when the lock is now ours.
 */
function takeOver(lockPath: string, staleMs: number): boolean {
  const guardPath = `${lockPath}.takeover`;
  try {
    mkdirSync(guardPath);
  } catch (err: unknown) {
    if (getErrorCode(err) !== 'EEXIST') throw err;
    const guardAge = lockAgeMs(guardPath);
    if (guardAge !== undefined && guardAge >= staleMs) {
      rmSync(guardPath, { recursive: true, force: true });
    }
    return false;
  }
  try {
    const ageMs = lockAgeMs(lockPath);
    if (ageMs !== undefined) {
      if (ageMs < staleMs) return false;
      rmSync(lockPath, { recursive: true, force: true });
    }
    try {
      mkdirSync(lockPath);
      return true;
    } catch (err: unknown) {
      if (getErrorCode(err) !== 'EEXIST') throw err;
      return false;
    }
  } finally {
    rmSync(guardPath, { recursive: true, force: true });
  }
}

/**
 * Try to create the lock directory, taking over a stale lock once.
 *
 * @param lockPath - Lock directory path.
 * @param filePath - Locked file (for error messages).
 * @param staleMs - Stale threshold in ms.
 */
function acquire(lockPath: string, filePath: string, staleMs: number): void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (err: unknown) {
      if (getErrorCode(err) !== 'EEXIST') throw err;
      const ageMs = lockAgeMs(lockPath);
      // Released between mkdir and stat — retry.
      if (ageMs === undefined) continue;
      if (ageMs >= staleMs && takeOver(lockPath, staleMs)) return;
      throw new FileLockedError(filePath);
    }
  }
  throw new FileLockedError(filePath);
}

/**
 * Execute a callback while holding an exclusive lock on a file.
 *
 * @remarks
 * Fails fast (no retries) with an `ELOCKED` error when the lock is held,
 * matching the v0.x behaviour. The lock is always released in a `finally`
 * block. The target file need not exist. `fn` must complete well within
 * `staleMs`: the lock is not refreshed while held, so a longer callback can
 * be taken over by another process.
 *
 * @param filePath - Absolute path to the file to lock.
 * @param fn - Callback to execute while holding the lock.
 * @param staleMs - Stale threshold in ms. Defaults to {@link STALE_LOCK_MS}.
 */
export async function withFileLock(
  filePath: string,
  fn: () => void | Promise<void>,
  staleMs: number = STALE_LOCK_MS,
): Promise<void> {
  const lockPath = `${filePath}.lock`;
  acquire(lockPath, filePath, staleMs);
  try {
    await fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
