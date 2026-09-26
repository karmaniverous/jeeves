/**
 * Secret handling for plugin config: generate the jeeves-server plugin key
 * seed and redact secret values from every line the CLI prints.
 *
 * @remarks
 * Generated seeds are 32 random bytes from `node:crypto`, hex-encoded (the
 * same 64-char shape the server's `keys._plugin` seeds use). Redaction is
 * plain substring replacement of each secret and of its JSON-escaped form
 * (batch file contents are JSON), applied to command lines, logs, dry-run
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
 * Replace every occurrence of each secret, raw or JSON-escaped, with
 * {@link REDACTED}.
 *
 * @remarks
 * The escaped form matters for secrets containing quotes, backslashes or
 * control characters: inside serialized JSON (a batch file payload) they
 * no longer appear verbatim.
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
    if (!secret) continue;
    const escaped = JSON.stringify(secret).slice(1, -1);
    for (const form of new Set([secret, escaped])) {
      out = out.split(form).join(REDACTED);
    }
  }
  return out;
}
