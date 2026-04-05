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
