/**
 * Shared internal utility functions.
 *
 * @packageDocumentation
 */

/**
 * Extract a human-readable message from an unknown caught value.
 *
 * @param err - The caught value (typically `unknown`).
 * @returns The error message string.
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Error codes / names that indicate transient network failures. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'AbortError',
]);

/**
 * Classify whether an error is a transient network failure.
 *
 * @param err - The caught value.
 * @returns `true` for ECONNRESET, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT,
 *          AbortError, and timeout-related fetch errors.
 */
export function isTransientError(err: unknown): boolean {
  let current: unknown = err;

  while (current instanceof Error) {
    if (TRANSIENT_CODES.has(current.name)) return true;

    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
