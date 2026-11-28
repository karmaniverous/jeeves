/**
 * A catalog transport to the app's own routes, in-process (#136).
 *
 * @remarks
 * Core's `httpTransport` (which builds every request) over a `fetch` that
 * calls Fastify's `inject` instead of the network. Each call passes the
 * app's auth hook, validation, handlers and error mapping like an HTTP
 * caller's, carrying the headers it is given (the MCP endpoint gives its
 * caller's credential headers).
 *
 * @module
 */

import type { FastifyInstance } from 'fastify';

import {
  type CatalogTransport,
  httpTransport,
} from '../catalog/httpTransport.js';

/** Base URL `httpTransport` builds request URLs on; only path and query reach the app. */
const IN_PROCESS_BASE_URL = 'http://in-process.internal';

/** Statuses whose responses have no body (a `Response` refuses one). */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** Fastify's injected-response headers. */
type InjectedHeaders = Record<string, string | string[] | number | undefined>;

/**
 * Injected-response headers as a `Headers` object.
 *
 * @param raw - Injected-response headers.
 * @returns The headers.
 */
function headersOf(raw: InjectedHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, String(item));
  }
  return headers;
}

/**
 * Settle with `promise`, or reject with the signal's reason once it aborts.
 * `inject` cannot be cancelled: an aborted call stops being awaited, and the
 * route keeps running, as a timed-out HTTP request does on the server.
 *
 * @param promise - The pending call.
 * @param signal - Abort signal.
 * @returns The call's result.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason as Error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * The `fetch` calls `httpTransport` makes: a URL string, a method, a
 * signal, and a string (JSON) or `Uint8Array` (a raw body, spec 5.8) body,
 * or none.
 */
type TransportFetch = (
  url: string,
  init: RequestInit & { method: string; signal: AbortSignal },
) => Promise<Response>;

/**
 * A `fetch` answered by `app.inject`.
 *
 * @param app - The Fastify app.
 * @param headers - Headers added to every request.
 * @returns The fetch.
 */
function injectFetch(
  app: FastifyInstance,
  headers: Readonly<Record<string, string>>,
): TransportFetch {
  return async (url, init) => {
    const { pathname, search } = new URL(url);
    const res = await untilAborted(
      app.inject({
        method: init.method as 'GET',
        url: pathname + search,
        headers: {
          ...headers,
          ...Object.fromEntries(new Headers(init.headers)),
        },
        ...(typeof init.body === 'string'
          ? { payload: init.body }
          : init.body instanceof Uint8Array
            ? { payload: Buffer.from(init.body) }
            : {}),
      }),
      init.signal,
    );
    return new Response(
      NULL_BODY_STATUSES.has(res.statusCode) ? null : res.rawPayload,
      { status: res.statusCode, headers: headersOf(res.headers) },
    );
  };
}

/**
 * A transport to the app's own routes.
 *
 * @param app - The Fastify app (its routes and hooks registered).
 * @param headers - Headers sent with every request (e.g. the caller's
 *   `authorization`); the request's own headers win on a clash.
 * @returns The transport.
 */
export function injectTransport(
  app: FastifyInstance,
  headers: Readonly<Record<string, string>> = {},
): CatalogTransport {
  return httpTransport({
    baseUrl: IN_PROCESS_BASE_URL,
    // httpTransport calls fetch only as TransportFetch describes.
    fetch: injectFetch(app, headers) as typeof fetch,
  });
}
