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
  if (!(err instanceof Error)) return false;

  if (TRANSIENT_CODES.has(err.name)) return true;

  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;

  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeCode = (cause as NodeJS.ErrnoException).code;
    if (typeof causeCode === 'string' && TRANSIENT_CODES.has(causeCode))
      return true;
    if (TRANSIENT_CODES.has(cause.name)) return true;
  }

  return false;
}
