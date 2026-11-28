/**
 * The MCP endpoint on a component's Fastify app (#136).
 *
 * @remarks
 * Streamable HTTP, stateless: `createMcpHandler` serves the 2026-07-28
 * revision (a JSON response: tools send no notifications) and falls back to
 * stateless 2025-era serving (a one-event SSE response), with one server per
 * request from definitions built once ({@link prepareCatalogMcpServer}).
 * Requests whose `Origin` is not allowed are refused with `403` (DNS
 * rebinding); a request without `Origin` (a non-browser client) passes. The
 * component's required `authenticate` then decides who may use the endpoint
 * at all. Each tool call is a new request to the app's own routes
 * ({@link injectTransport}), checked by the routes' own auth again, carrying
 * only the caller's credential headers: `authorization` and named headers,
 * never cookies (spec 5.5, Decisions 95, 96).
 *
 * @module
 */

import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Catalog } from '../catalog/types.js';
import {
  type CatalogMcpContent,
  prepareCatalogMcpServer,
} from './catalogMcpServer.js';
import { injectTransport } from './injectTransport.js';

/** Default path of the endpoint. */
export const MCP_PATH = '/mcp';

/**
 * The component's front-door check for the endpoint (spec 5.5): called with
 * every `/mcp` request after the origin check; throw to refuse. The error
 * reaches the app's error handler like any route error (with
 * `registerErrorHandlers`, a `defineError` error keeps its status, code and
 * message).
 */
export type McpAuthenticate = (request: FastifyRequest) => void | Promise<void>;

/** Options for {@link registerMcpEndpoint}. */
export interface McpEndpointOptions<
  C extends Catalog = Catalog,
> extends CatalogMcpContent<C> {
  /**
   * Who may use the endpoint at all (required, so no component ships an
   * unprotected `/mcp` by omission). Tool calls are checked again by the
   * routes they reach.
   */
  authenticate: McpAuthenticate;
  /**
   * Largest `/mcp` request body, in bytes; default the app's `bodyLimit`.
   * Tool arguments travel in this body: raise it (and the target entry's own
   * `bodyLimit`) for tools that take large inputs.
   */
  bodyLimit?: number;
  /** Endpoint path; default `/mcp`. */
  path?: string;
  /**
   * Origin hostnames allowed to call the endpoint (no scheme or port, as
   * `validateOriginHeader` takes them); default the localhost ones.
   */
  allowedOrigins?: string[];
}

/**
 * Request headers that carry a credential under the catalog's auth schemes:
 * `authorization` for bearer and the named header. A query credential is not
 * forwarded (it names the endpoint URL, not a tool call's), and a cookie
 * never is, even when the catalog declares a cookie scheme: MCP clients are
 * not browsers, and a session cookie must not run tools as its owner
 * (Decision 96).
 *
 * @param catalog - The endpoint catalog.
 * @returns Lowercase header names.
 */
export function credentialHeaderNames(catalog: Catalog): string[] {
  const names = new Set<string>();
  for (const { auth } of catalog.entries) {
    if (auth === 'none') continue;
    for (const scheme of auth.schemes) {
      if (scheme.in === 'bearer') names.add('authorization');
      else if (scheme.in === 'header') names.add(scheme.name.toLowerCase());
    }
  }
  return [...names].sort();
}

/**
 * The named headers a request carries.
 *
 * @param headers - Request headers.
 * @param names - Lowercase header names.
 * @returns The present ones.
 */
function pick(headers: Headers, names: string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) picked[name] = value;
  }
  return picked;
}

/** Headers that describe the original body, which the web request does not carry. */
const BODY_HEADERS = new Set(['content-length', 'transfer-encoding']);

/**
 * The Fastify request as a web-standard one, without its body (passed
 * pre-parsed), aborted when the client goes away.
 *
 * @param request - Fastify request.
 * @param reply - Its reply.
 * @returns The web request.
 */
function toWebRequest(request: FastifyRequest, reply: FastifyReply): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || BODY_HEADERS.has(name)) continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, item);
  }
  const controller = new AbortController();
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return new Request(new URL(request.url, 'http://localhost'), {
    method: request.method,
    headers,
    signal: controller.signal,
  });
}

/**
 * Send a web-standard response through the Fastify reply.
 *
 * @param reply - Fastify reply.
 * @param res - Web response.
 * @returns The reply.
 */
function send(reply: FastifyReply, res: Response): FastifyReply {
  reply.code(res.status);
  res.headers.forEach((value, name) => {
    void reply.header(name, value);
  });
  return reply.send(
    res.body
      ? Readable.fromWeb(res.body as NodeReadableStream<Uint8Array>)
      : null,
  );
}

/**
 * Register the MCP endpoint (`GET`, `POST` and `DELETE` on `path`) on a
 * component's app.
 *
 * @remarks
 * Order per request: origin check (`403`), then `authenticate`, then the MCP
 * handler. A tool call to an entry the caller may not use gets the route's
 * own `401`/`403` as an error result. Register it where a scoped hook that
 * refuses non-catalog routes doesn't cover it.
 *
 * @param app - The component's Fastify app (its routes and hooks registered).
 * @param options - Server content, tool selection, `authenticate`, path,
 *   allowed origins and body limit.
 * @throws Error at registration for an invalid tool selection.
 */
export function registerMcpEndpoint<C extends Catalog>(
  app: FastifyInstance,
  options: McpEndpointOptions<C>,
): void {
  const {
    path = MCP_PATH,
    allowedOrigins = localhostAllowedOrigins(),
    authenticate,
    bodyLimit,
    ...content
  } = options;
  const credentials = credentialHeaderNames(content.catalog);
  // Built and checked once: a configuration mistake throws here, at
  // registration (spec 5.2, Decision 94).
  const serverFor = prepareCatalogMcpServer(content);

  const handler = createMcpHandler(
    ({ requestInfo }) =>
      serverFor(
        injectTransport(
          app,
          requestInfo ? pick(requestInfo.headers, credentials) : {},
        ),
      ),
    {
      onerror: (error) => {
        app.log.error({ err: error }, 'MCP request failed');
      },
    },
  );

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: path,
    ...(bodyLimit !== undefined ? { bodyLimit } : {}),
    handler: async (request, reply) => {
      const webRequest = toWebRequest(request, reply);
      const refused = originValidationResponse(webRequest, allowedOrigins);
      if (refused) return send(reply, refused);
      await authenticate(request);
      const res = await handler.fetch(
        webRequest,
        request.body === undefined ? {} : { parsedBody: request.body },
      );
      return send(reply, res);
    },
  });
}
