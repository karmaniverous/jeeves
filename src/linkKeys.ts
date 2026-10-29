/**
 * jeeves-server link keys (#149): the HMAC keys in insider and share links,
 * byte-identical to jeeves-server-core's, so any component can build a link
 * without depending on jeeves-server.
 *
 * @module
 */

import { createHmac } from 'node:crypto';

/**
 * First 32 hex characters of HMAC-SHA256(key, data).
 *
 * @param key - HMAC key (the server's API key).
 * @param data - Message.
 * @returns The truncated digest.
 */
function hmac32(key: string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex').substring(0, 32);
}

/**
 * A URL path as link keys see it: lower-case, without leading or trailing
 * slashes.
 *
 * @param urlPath - Browse path (e.g. `/j/docs/a.md`).
 * @returns The normalised path.
 */
function normalisePath(urlPath: string): string {
  return urlPath.toLowerCase().replace(/^\/+|\/+$/g, '');
}

/**
 * Path-specific key: HMAC-SHA256(apiKey, normalised path).
 *
 * @param apiKey - The jeeves-server API key.
 * @param urlPath - Browse path; case and leading/trailing slashes ignored.
 * @returns 32 hex characters.
 */
export function computePathKey(apiKey: string, urlPath: string): string {
  return hmac32(apiKey, normalisePath(urlPath));
}

/**
 * Insider key: HMAC-SHA256(apiKey, `"insider"`). Valid for any path.
 *
 * @param apiKey - The jeeves-server API key.
 * @returns 32 hex characters.
 */
export function computeInsiderKey(apiKey: string): string {
  return hmac32(apiKey, 'insider');
}

/**
 * Outsider share key with expiry: HMAC-SHA256(apiKey, `path|expiry`).
 *
 * @param apiKey - The jeeves-server API key.
 * @param urlPath - Browse path; case and leading/trailing slashes ignored.
 * @param expiry - Expiry as sent in the link (a number and its string form
 *   give the same key).
 * @returns 32 hex characters.
 */
export function computeOutsiderKeyWithExpiry(
  apiKey: string,
  urlPath: string,
  expiry: string | number,
): string {
  return hmac32(apiKey, `${normalisePath(urlPath)}|${String(expiry)}`);
}
