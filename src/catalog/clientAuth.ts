/**
 * Client credentials and how they're attached to requests (spec 5.4).
 *
 * @module
 */

import type { CatalogRequest } from './buildCatalogRequest.js';
import type { AuthScheme, CatalogEntry } from './types.js';

/**
 * A credential value, or a resolver read on every request (as a plugin reads
 * its key at call time). A resolver returning `undefined` attaches nothing.
 */
export type Secret =
  string | (() => string | undefined | Promise<string | undefined>);

/** How the client presents its credential. */
export type ClientAuth =
  | {
      /** `Authorization: Bearer <value>`. */
      bearer: Secret;
    }
  | {
      /** A request header. */
      header: {
        /** Header name. */
        name: string;
        /** Header value. */
        value: Secret;
      };
    }
  | {
      /** A query parameter. */
      query: {
        /** Parameter name. */
        name: string;
        /** Parameter value. */
        value: Secret;
      };
    }
  | {
      /** A cookie. */
      cookie: {
        /** Cookie name. */
        name: string;
        /** Cookie value. */
        value: Secret;
      };
    };

/** The `in` kind and name of a client credential, and its secret. */
export interface Credential {
  /** Where the credential goes. */
  kind: AuthScheme['in'];
  /** Header, query or cookie name (`authorization` for bearer). */
  name: string;
  /** The secret. */
  value: Secret;
}

/**
 * Normalise a {@link ClientAuth}.
 *
 * @param auth - Client credential.
 * @returns Kind, name and secret.
 */
export function credentialOf(auth: ClientAuth): Credential {
  if ('bearer' in auth)
    return { kind: 'bearer', name: 'authorization', value: auth.bearer };
  if ('header' in auth) return { kind: 'header', ...auth.header };
  if ('query' in auth) return { kind: 'query', ...auth.query };
  return { kind: 'cookie', ...auth.cookie };
}

/**
 * Attach a credential to a request when the entry accepts its kind.
 *
 * @param entry - Catalog entry.
 * @param request - Built request (mutated).
 * @param credential - Normalised credential.
 */
export async function attachCredential(
  entry: CatalogEntry,
  request: CatalogRequest,
  credential: Credential | undefined,
): Promise<void> {
  if (!credential || entry.auth === 'none') return;
  if (!entry.auth.schemes.some((s) => s.in === credential.kind)) return;
  const value =
    typeof credential.value === 'function'
      ? await credential.value()
      : credential.value;
  if (value === undefined) return;
  if (credential.kind === 'bearer')
    request.headers.authorization = `Bearer ${value}`;
  else if (credential.kind === 'header')
    request.headers[credential.name.toLowerCase()] = value;
  else if (credential.kind === 'query')
    request.query.push([credential.name, value]);
  else
    request.headers.cookie = `${credential.name}=${encodeURIComponent(value)}`;
}
