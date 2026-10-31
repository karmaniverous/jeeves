/**
 * Catalog transports (spec 5.3).
 *
 * @module
 */

import type { PluginApiUrlResolver } from '../plugin/pluginApiUrl.js';
import type { CatalogRequest } from './buildCatalogRequest.js';

/** What a transport returns: status, headers and lazy body readers. */
export interface CatalogResponse {
  /** HTTP status. */
  status: number;
  /** Response headers. */
  headers: Headers;
  /** Body as parsed JSON. */
  json(): Promise<unknown>;
  /** Body as text. */
  text(): Promise<string>;
  /** Body as bytes. */
  bytes(): Promise<Uint8Array>;
  /** Raw body stream. */
  body: ReadableStream<Uint8Array> | null;
}

/** Sends a built request; rejects on network failure or abort. */
export type CatalogTransport = (
  request: CatalogRequest,
  signal: AbortSignal,
) => Promise<CatalogResponse>;

/** Options for {@link httpTransport}. */
export interface HttpTransportOptions {
  /**
   * Service base URL, or a resolver evaluated on every request (a plugin's
   * `apiUrl`, read at call time). A trailing slash is stripped.
   */
  baseUrl: string | PluginApiUrlResolver;
  /** `fetch` implementation; default the global one. */
  fetch?: typeof fetch;
}

/**
 * The full URL for a request.
 *
 * @param baseUrl - Resolved base URL.
 * @param request - Built request.
 * @returns The URL string.
 */
function urlOf(baseUrl: string, request: CatalogRequest): string {
  // encodeURIComponent (space as %20), as the 0.7.0 tools encoded queries.
  const qs = request.query
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${baseUrl.replace(/\/+$/, '')}${request.path}${qs ? `?${qs}` : ''}`;
}

/**
 * A transport over HTTP `fetch`.
 *
 * @param options - Base URL (or resolver) and optional `fetch`.
 * @returns The transport.
 */
export function httpTransport(options: HttpTransportOptions): CatalogTransport {
  return async (request, signal) => {
    const baseUrl =
      typeof options.baseUrl === 'function'
        ? options.baseUrl()
        : options.baseUrl;
    if (!baseUrl) throw new Error('httpTransport: no base URL resolved');
    const hasBody = request.body !== undefined;
    const res = await (options.fetch ?? fetch)(urlOf(baseUrl, request), {
      method: request.method,
      headers: hasBody
        ? { 'content-type': 'application/json', ...request.headers }
        : request.headers,
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      signal,
    });
    return {
      status: res.status,
      headers: res.headers,
      json: () => res.json(),
      text: () => res.text(),
      bytes: async () => new Uint8Array(await res.arrayBuffer()),
      body: res.body,
    };
  };
}
