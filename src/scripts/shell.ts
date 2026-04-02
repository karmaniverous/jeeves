/**
 * Shell execution utilities for runner job scripts.
 *
 * @module
 */

import cp from 'node:child_process';

import { sleepMs } from './fs-utils.js';

/** Options for synchronous command execution. */
export interface RunOptions {
  /** Output encoding (default utf8). */
  encoding?: BufferEncoding;
  /** Max stdout/stderr buffer size in bytes. */
  maxBuffer?: number;
  /** Execution timeout in milliseconds. */
  timeout?: number;
  /** Run command through the shell. */
  shell?: boolean;
}

/**
 * Run a command synchronously and return trimmed stdout.
 * Throws on non-zero exit code.
 */
export function run(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): string {
  const r = cp.spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  });
  if (r.error) throw r.error;
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  if (r.status !== 0) {
    const msg = (stderr || stdout).trim();
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${String(r.status)}): ${msg}`,
    );
  }
  return stdout.trim();
}

/** Options for retry-enabled command execution. */
export interface RetryOptions {
  /** Number of retries (default 2). */
  retries?: number;
  /** Base backoff interval in milliseconds (default 5000). */
  backoffMs?: number;
  /** Custom predicate to determine if an error is retryable. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Run a command with automatic retries on transient failures.
 * Uses exponential backoff between attempts.
 */
export function runWithRetry(
  cmd: string,
  args: string[],
  opts: RetryOptions & RunOptions = {},
): string {
  const { retries = 2, backoffMs = 5000, isRetryable, ...runOpts } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return run(cmd, args, runOpts);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = isRetryable
        ? isRetryable(e)
        : /context deadline exceeded|timed out|timeout/i.test(msg);
      if (!retryable || attempt === retries) throw lastErr;
      sleepMs(backoffMs * Math.pow(2, attempt));
    }
  }

  throw lastErr;
}
