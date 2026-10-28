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
} from './buildCatalogRequest.js';
import {
  attachCredential,
  type ClientAuth,
  credentialOf,
} from './clientAuth.js';
import { CatalogClientError } from './clientError.js';
import { errorBodySchema } from './errorBody.js';
import { type CatalogResponse, httpTransport } from './httpTransport.js';
import { isJsonContentType, isTextContentType } from './schemaHelpers.js';
import type { Catalog, CatalogEntry, IsJsonEntry } from './types.js';

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
    // Optional when the entry has no required input field.
    ...input: Record<never, never> extends CatalogInput<E>
      ? [input?: CatalogInput<E>]
      : [input: CatalogInput<E>]
  ) => Promise<ClientResponse<E>>;
};

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
    return isTextContentType(entry.contentType as string)
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
    try {
      await attachCredential(entry, request, credential);
      const res = await transport(request, AbortSignal.timeout(timeoutMs));
      return await readResponse(entry, res);
    } catch (cause) {
      // HTTP-status and schema errors pass through; anything else (a failed
      // credential resolver, a network error, a timeout while the body is
      // still arriving, malformed JSON) is a status-0 client error (5.4).
      if (cause instanceof CatalogClientError) throw cause;
      throw new CatalogClientError(`${entry.name} request failed`, {
        status: 0,
        cause,
      });
    }
  };

  return Object.fromEntries(
    catalog.entries.map((entry) => [
      entry.name,
      (input: unknown) => call(entry, input),
    ]),
  ) as CatalogClient<C>;
}
