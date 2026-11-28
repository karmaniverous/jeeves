/**
 * Registration of a catalog route whose request body is raw bytes
 * (spec 0.12.0 §5.8, #176).
 *
 * @module
 */

import type { FastifyInstance, RouteOptions } from 'fastify';

/**
 * Register a binary-body route in its own encapsulated child of the catalog
 * scope, so its buffer parser applies to exactly this route. The child
 * inherits the scope's hooks (the component's access hook included), error
 * handler and serializers. Only the declared media type parses there: the
 * inherited JSON and text parsers go, so any other content type, JSON
 * included, is Fastify's 415; a body over the route's `bodyLimit` is 413.
 *
 * @param scope - The catalog scope.
 * @param contentType - The entry's `requestContentType`.
 * @param route - The route, with its handler and `bodyLimit`.
 */
export function registerBinaryRoute(
  scope: FastifyInstance,
  contentType: string,
  route: RouteOptions,
): void {
  void scope.register(
    (child) =>
      new Promise<void>((resolve) => {
        child.removeAllContentTypeParsers();
        child.addContentTypeParser(
          contentType,
          { parseAs: 'buffer' },
          (_request, body, done) => {
            done(null, body);
          },
        );
        child.route(route);
        resolve();
      }),
  );
}
