/**
 * Secret handling for plugin config: generate the jeeves-server plugin key
 * seed and redact secret values from every line the CLI prints.
 *
 * @remarks
 * Generated seeds are 32 random bytes from `node:crypto`, hex-encoded (the
 * same 64-char shape the server's `keys._plugin` seeds use). Redaction is
 * plain substring replacement, applied to command lines, logs, dry-run
 * output and error messages before they are printed.
 *
 * @module
 */

import { randomBytes } from 'node:crypto';

/** Placeholder printed instead of a secret value. */
export const REDACTED = '<redacted>';

/**
 * Generate a new jeeves-server plugin key seed.
 *
 * @returns 64 hex characters (256 bits).
 */
export const generatePluginKey = (): string => randomBytes(32).toString('hex');

/**
 * Replace every occurrence of each secret with {@link REDACTED}.
 *
 * @param text - Text to print.
 * @param secrets - Secret values (empty strings are ignored).
 * @returns The redacted text.
 */
export function redactSecrets(
  text: string,
  secrets: readonly string[] = [],
): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(REDACTED);
  }
  return out;
}
