/**
 * The one retry helper (async and sync forms of the same policy): try up
 * to `attempts` times, waiting `delayMs(attempt)` after a failure the
 * policy calls retryable, and rethrow the last error otherwise.
 *
 * @module
 */

import { sleepAsync } from './fs-utils.js';

/** When and how long to retry. */
export interface RetryPolicy {
  /** Total tries (at least 1). */
  attempts: number;
  /** The wait after failed attempt `attempt` (1-based); default none. */
  delayMs?: (attempt: number) => number;
  /** Whether an error is worth another try; default every error. */
  isRetryable?: (err: unknown) => boolean;
  /** Called before each wait (logging). */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/** Exponential backoff: `baseMs`, `2 * baseMs`, `4 * baseMs`, ... */
export const exponentialBackoff =
  (baseMs: number) =>
  (attempt: number): number =>
    baseMs * 2 ** (attempt - 1);

/** The wait before the next try, or `undefined` to give up with `err`. */
const nextDelay = (
  err: unknown,
  attempt: number,
  policy: RetryPolicy,
): number | undefined => {
  if (attempt >= policy.attempts) return undefined;
  if (policy.isRetryable && !policy.isRetryable(err)) return undefined;
  const ms = policy.delayMs?.(attempt) ?? 0;
  policy.onRetry?.(err, attempt, ms);
  return ms;
};

/**
 * Run `fn` (given the 1-based attempt) until it resolves or the policy
 * gives up.
 *
 * @throws The last error.
 */
export async function retryAsync<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy & { sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const ms = nextDelay(err, attempt, policy);
      if (ms === undefined) throw err;
      if (ms > 0) await (policy.sleep ?? sleepAsync)(ms);
    }
  }
}

/**
 * Run `fn` synchronously until it returns or the policy gives up.
 *
 * @throws The last error.
 */
export function retrySync<T>(
  fn: (attempt: number) => T,
  policy: RetryPolicy & { sleep: (ms: number) => void },
): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return fn(attempt);
    } catch (err) {
      const ms = nextDelay(err, attempt, policy);
      if (ms === undefined) throw err;
      if (ms > 0) policy.sleep(ms);
    }
  }
}
