/**
 * The `/openapi.json` route (spec 5.5).
 *
 * @module
 */

import type { FastifyInstance } from 'fastify';

/**
 * Serve a prebuilt OpenAPI document (normally the committed `openapi.json`).
 *
 * @remarks
 * Served with no auth: the component's auth hook must exempt the path.
 *
 * @param app - Fastify app.
 * @param document - The document.
 * @param options - `path`, default `/openapi.json`.
 */
export function registerOpenApiRoute(
  app: FastifyInstance,
  document: object,
  options: { path?: string } = {},
): void {
  const body = JSON.stringify(document);
  app.get(options.path ?? '/openapi.json', (_request, reply) =>
    reply.type('application/json').send(body),
  );
}
