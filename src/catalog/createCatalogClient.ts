/**
 * Typed catalog client (spec 5.4).
 *
 * @module
 */

import type { z } from 'zod';

import { DEFAULT_FETCH_TIMEOUT_MS } from '../plugin/http.js';
import type { PluginApiUrlResolver } from '../plugin/pluginApiUrl.js';
import {
  buildCatalogRequest,
  type CatalogInput,
  type CatalogRequest,
} from './buildCatalogRequest.js';
import { CatalogClientError } from './clientError.js';
import { errorBodySchema } from './errorBody.js';
import { type CatalogResponse, httpTransport } from './httpTransport.js';
import { isJsonContentType } from './schemaHelpers.js';
import type {
  AuthScheme,
  Catalog,
  CatalogEntry,
  IsJsonEntry,
} from './types.js';

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

/** Options for {@link createCatalogClient}. */
export interface CatalogClientOptions {
  /** Service base URL, or a resolver evaluated on every request. */
  baseUrl: string | PluginApiUrlResolver;
  /** Credential, attached to entries whose `auth` lists a matching scheme. */
  auth?: ClientAuth;
  /** Abort after this many milliseconds; default `DEFAULT_FETCH_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** `fetch` implementation; default the global one. */
  fetch?: typeof fetch;
}

/** What a client method resolves to for an entry. */
export type ClientResponse<E extends CatalogEntry> =
  IsJsonEntry<E> extends true
    ? z.output<E['response']>
    : E['contentType'] extends `text/${string}`
      ? string
      : Uint8Array;

/** One method per catalog entry, keyed by entry name. */
export type CatalogClient<C extends Catalog> = {
  [E in C['entries'][number] as E['name']]: (
    input: CatalogInput<E>,
  ) => Promise<ClientResponse<E>>;
};

/** The `in` kind and name of a client credential, and its secret. */
interface Credential {
  kind: AuthScheme['in'];
  name: string;
  value: Secret;
}

/**
 * Normalise a {@link ClientAuth}.
 *
 * @param auth - Client credential.
 * @returns Kind, name and secret.
 */
function credentialOf(auth: ClientAuth): Credential {
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
async function attach(
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

/**
 * Read a response as the entry's result, or throw.
 *
 * @param entry - Catalog entry.
 * @param res - Transport response.
 * @returns The parsed result.
 * @throws {@link CatalogClientError} for a non-2xx status or a 2xx JSON body
 *   that doesn't match the entry's response schema.
 */
async function readResponse(
  entry: CatalogEntry,
  res: CatalogResponse,
): Promise<unknown> {
  // fetch never yields a status below 200, so anything from 300 up is non-2xx.
  if (res.status >= 300) {
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = errorBodySchema.safeParse(json);
    throw new CatalogClientError(
      `${entry.name} failed with HTTP ${String(res.status)}`,
      {
        status: res.status,
        body: parsed.success ? parsed.data : { error: text },
      },
    );
  }
  if (!isJsonContentType(entry.contentType))
    return (entry.contentType as string).startsWith('text/')
      ? res.text()
      : res.bytes();
  const parsed = entry.response.safeParse(await res.json());
  if (!parsed.success)
    throw new CatalogClientError(
      `${entry.name} returned a response that does not match its schema`,
      { status: res.status, issues: parsed.error.issues },
    );
  return parsed.data;
}

/**
 * Create a typed client for a catalog: one method per entry name, taking the
 * entry's flat input and resolving to its parsed response.
 *
 * @param catalog - The catalog.
 * @param options - Base URL, credential, timeout and `fetch`.
 * @returns The client.
 */
export function createCatalogClient<C extends Catalog>(
  catalog: C,
  options: CatalogClientOptions,
): CatalogClient<C> {
  const transport = httpTransport({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const credential = options.auth ? credentialOf(options.auth) : undefined;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const call = async (entry: CatalogEntry, input: unknown) => {
    const request = buildCatalogRequest(entry, input as never);
    await attach(entry, request, credential);
    let res: CatalogResponse;
    try {
      res = await transport(request, AbortSignal.timeout(timeoutMs));
    } catch (cause) {
      throw new CatalogClientError(`${entry.name} request failed`, {
        status: 0,
        cause,
      });
    }
    return readResponse(entry, res);
  };

  return Object.fromEntries(
    catalog.entries.map((entry) => [
      entry.name,
      (input: unknown) => call(entry, input),
    ]),
  ) as CatalogClient<C>;
}
