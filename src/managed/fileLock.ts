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
 * {@link STALE_LOCK_MS} is considered abandoned and is taken over.
 *
 * @module
 */

import { mkdirSync, rmSync, statSync } from 'node:fs';

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

/** Return the error code of a Node fs error, if any. */
function errorCode(err: unknown): string | undefined {
  return err instanceof Error && 'code' in err
    ? String((err as NodeJS.ErrnoException).code)
    : undefined;
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
      if (errorCode(err) !== 'EEXIST') throw err;
      let ageMs: number;
      try {
        ageMs = Date.now() - statSync(lockPath).mtimeMs;
      } catch (statErr: unknown) {
        // Released between mkdir and stat — retry.
        if (errorCode(statErr) === 'ENOENT') continue;
        throw statErr;
      }
      if (ageMs < staleMs || attempt > 0) throw new FileLockedError(filePath);
      rmSync(lockPath, { recursive: true, force: true });
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
 * block. The target file need not exist.
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
