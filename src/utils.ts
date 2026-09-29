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

/**
 * Whether a value is a plain object (not `null`, not an array).
 *
 * @param value - Any value.
 * @returns `true` when `value` can be indexed as a string-keyed record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The Node-style `code` of a caught error (e.g. `EEXIST`, `EPERM`).
 *
 * @param err - The caught value.
 * @returns The code as a string, or undefined when there is none.
 */
export function getErrorCode(err: unknown): string | undefined {
  return err instanceof Error && 'code' in err
    ? String((err as NodeJS.ErrnoException).code)
    : undefined;
}

/**
 * `JSON.parse` that fails with a caller-supplied message (original error as
 * `cause`).
 *
 * @param text - JSON text.
 * @param message - Message of the thrown error.
 * @returns The parsed value.
 */
export function parseJson(text: string, message: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(message, { cause: error });
  }
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
