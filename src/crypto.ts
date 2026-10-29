/**
 * Link-key derivation for jeeves-server share URLs.
 *
 * @remarks
 * Mirrors `@karmaniverous/jeeves-server-core`'s `packages/core/src/crypto.ts`
 * byte-for-byte: same names, signatures and output. jeeves-server-core
 * re-exports these from `@karmaniverous/jeeves` instead of maintaining a
 * second implementation of a security-relevant key derivation. Only
 * `node:crypto` is used.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';

/** Lower-case a URL path and strip leading/trailing slashes. */
function normalizePath(urlPath: string): string {
  return urlPath.toLowerCase().replace(/^\/+|\/+$/g, '');
}

/** `HMAC-SHA256(secret, data)` as lower-case hex, truncated to 32 characters. */
function hmacKey(secret: string, data: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Compute a path-specific link key: `HMAC-SHA256(apiKey, normalizedPath)`,
 * truncated to 32 hex characters.
 *
 * @param apiKey - The server's API key (HMAC secret).
 * @param urlPath - The URL path to scope the key to. Normalized by
 * lower-casing and stripping leading/trailing slashes before hashing, so
 * `/Foo/Bar/`, `foo/bar` and `/foo/bar` all produce the same key.
 * @returns A 32-character lower-case hex key.
 */
export function computePathKey(apiKey: string, urlPath: string): string {
  return hmacKey(apiKey, normalizePath(urlPath));
}

/**
 * Compute the insider key: `HMAC-SHA256(apiKey, "insider")`, truncated to
 * 32 hex characters.
 *
 * @remarks
 * An insider key is path-independent: it grants full navigation for any
 * path, unlike {@link computePathKey} or
 * {@link computeOutsiderKeyWithExpiry}.
 *
 * @param apiKey - The server's API key (HMAC secret).
 * @returns A 32-character lower-case hex key.
 */
export function computeInsiderKey(apiKey: string): string {
  return hmacKey(apiKey, 'insider');
}

/**
 * Compute an outsider key with an expiry:
 * `HMAC-SHA256(apiKey, normalizedPath + "|" + expiry)`, truncated to 32 hex
 * characters.
 *
 * @param apiKey - The server's API key (HMAC secret).
 * @param urlPath - The URL path to scope the key to. Normalized the same
 * way as {@link computePathKey}.
 * @param expiry - The key's expiry, as an epoch-millisecond number or a
 * string. Stringified via `String(expiry)` before hashing, so the numeric
 * and string forms of the same value produce identical keys.
 * @returns A 32-character lower-case hex key.
 */
export function computeOutsiderKeyWithExpiry(
  apiKey: string,
  urlPath: string,
  expiry: string | number,
): string {
  return hmacKey(apiKey, `${normalizePath(urlPath)}|${String(expiry)}`);
}
