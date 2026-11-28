/**
 * Catalog-driven Fastify route registration (spec 5.5).
 *
 * @module
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  RouteOptions,
} from 'fastify';
import type { z } from 'zod';

import { errorBodySchema } from '../catalog/errorBody.js';
import { isJsonContentType } from '../catalog/schemaHelpers.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import { registerBinaryRoute } from './binaryRoute.js';
import { errorHandlerFor } from './errorHandler.js';
import {
  isBuiltErrorBody,
  normaliseErrorPayload,
  rawErrorPayloadBody,
  sentStatus,
  setErrorHeaders,
} from './errorReply.js';
import { errorSerializerFor, serializerFor } from './routeSerializers.js';
import type {
  CatalogHandler,
  CatalogHandlers,
  CatalogRouteLogger,
  HandlerResult,
  RegisterCatalogRoutesOptions,
  RequestInput,
} from './types.js';
import { sendWildcardFault } from './wildcardReply.js';
import { validatorCompiler } from './zodValidation.js';

/**
 * Fastify route schema for an entry. Every entry's `4xx`/`5xx` responses
 * use the error body; `2xx` is checked for JSON entries only.
 *
 * @param entry - Catalog entry.
 * @returns Its schema.
 */
function routeSchema(entry: CatalogEntry): FastifySchema {
  return {
    ...(entry.params ? { params: entry.params } : {}),
    ...(entry.query ? { querystring: entry.query } : {}),
    ...(entry.body ? { body: entry.body } : {}),
    response: {
      ...(isJsonContentType(entry.contentType)
        ? { '2xx': entry.response }
        : {}),
      '4xx': errorBodySchema,
      '5xx': errorBodySchema,
    },
  };
}

/**
 * Send a handler result. An error result's body goes out as JSON, and the
 * scope's `preSerialization` hook rebuilds it from the status (Fastify's
 * body; a 5xx keeps its message and is logged), like every other error
 * reply. For an entry whose declared `contentType` is a media range (spec
 * 5.2 Wildcard replies), a 2xx result without a concrete, matching
 * `content-type` in its headers is a logged handler fault, answered 500
 * instead: the declared range itself never reaches the wire.
 *
 * @param entry - Catalog entry.
 * @param result - Handler result.
 * @param reply - Fastify reply.
 * @param log - Where a wildcard-reply fault is logged.
 * @returns The sent reply.
 */
function send(
  entry: CatalogEntry,
  result: HandlerResult<CatalogEntry>,
  reply: FastifyReply,
  log: Pick<CatalogRouteLogger, 'error'>,
): FastifyReply {
  const fault = sendWildcardFault(entry, result, reply, log);
  if (fault) return fault;
  reply.status(result.status);
  if (result.status >= 400) {
    setErrorHeaders(reply, result.headers);
    return reply.send(result.body);
  }
  if (result.headers) void reply.headers(result.headers);
  if (isJsonContentType(entry.contentType)) return reply.send(result.body);
  if (!reply.hasHeader('content-type'))
    void reply.type(entry.contentType as string);
  const { body } = result;
  return reply.send(
    body instanceof Uint8Array && !Buffer.isBuffer(body)
      ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
      : body,
  );
}

/**
 * Register every catalog route on the app, in one encapsulated plugin whose
 * validator, serializer and error handler don't affect the rest of the app.
 *
 * @remarks
 * Every error in the scope (a thrown error, a request-validation failure, a
 * strict response mismatch, an error result, a reply one of the app's hooks
 * sends for a catalog route) is answered in Fastify's body,
 * `{ statusCode, code?, error, message }`, rebuilt from the reply status,
 * every 5xx logged; the app's own error handler is not consulted (spec
 * 5c.5). A thrown error made by a `defineError` class keeps its status,
 * `message`, `code` and allowlisted headers (`Retry-After`,
 * `WWW-Authenticate`, `Allow`), and so does a 4xx whose `code` begins
 * `FST_ERR_` (Fastify's naming convention for its own errors); every other
 * thrown error is a 500 with the generic
 * message, no `code` and none of its headers (spec 5d.1). An error result
 * or a standard body a hook sends keeps its status, `message` and `code`;
 * raw text, a stream, no body or a response mismatch gets the generic
 * message on a 5xx. Pre-serialized JSON text is parsed and treated like an
 * object; other text, a stream, a web `Response` with an error status or
 * no body gets the standard body. Routes outside the scope are untouched.
 * An error result's headers (and a trusted error's allowlisted ones) are
 * applied, except body headers and any Node would reject; headers already
 * on the reply are left alone. The routes' error serializer sends only
 * bodies core built: when one of the app's hooks throws again while an
 * error reply is being sent, Fastify's own default error handler first
 * applies that hook error's status and `headers` to the reply, then its
 * fallback hands the raw error to the serializer, which sends the masked
 * standard body for that status instead (a 4xx's status text or the
 * generic 5xx message, no `code`) and logs the error as
 * `Error reply masked (a hook failed while it was sent)`. Core masks only
 * the body: the status and headers stay the hook error's, so hooks must
 * not throw errors carrying headers or internal statuses.
 *
 * Auth isn't enforced here: register the component's auth hook on the root
 * app before calling this, so it applies to the catalog routes.
 *
 * @param app - Fastify app.
 * @param catalog - The catalog.
 * @param handlers - One handler per entry name.
 * @param options - Response validation mode and logger.
 * @returns Resolves when the routes are registered.
 */
export async function registerCatalogRoutes<C extends Catalog>(
  app: FastifyInstance,
  catalog: C,
  // NoInfer: C comes from the catalog alone, so handler returns are
  // contextually typed (a literal status: 200 stays a SuccessStatus).
  handlers: NoInfer<CatalogHandlers<C>>,
  options: RegisterCatalogRoutesOptions = {},
): Promise<void> {
  const mode = options.responseValidation ?? 'strict';
  const byName = handlers as unknown as Record<
    string,
    CatalogHandler<CatalogEntry>
  >;

  // A promise-returning plugin whose body runs in the executor, so a
  // registration error (e.g. a duplicate route) rejects this promise instead
  // of escaping as an uncaught exception.
  await app.register(
    (scope) =>
      new Promise<void>((resolve) => {
        scope.setValidatorCompiler(validatorCompiler);
        // Chosen by the response key (Fastify passes it lower-cased), not
        // by schema identity: a 2xx entry may use errorBodySchema itself.
        scope.setSerializerCompiler(({ schema, method, url, httpStatus }) =>
          httpStatus === '4xx' || httpStatus === '5xx'
            ? errorSerializerFor(options.logger ?? scope.log)
            : serializerFor(schema as z.ZodType, mode, (issues) => {
                (options.logger ?? scope.log).warn(
                  { method, url, httpStatus, issues },
                  'Response validation failed (log mode): sent unparsed',
                );
              }),
        );
        scope.setErrorHandler(errorHandlerFor(options.logger));
        // The one choke point for error bodies (spec 5c.1): every error
        // reply on a catalog route, from a handler result, the error
        // handler or a hook (the app's own included), is rebuilt from the
        // reply status.
        const normalised = new WeakSet<FastifyReply>();
        scope.addHook('preSerialization', (request, reply, payload, done) => {
          if (reply.statusCode < 400) {
            done(null, payload);
            return;
          }
          normalised.add(reply);
          if (isBuiltErrorBody(payload)) {
            done(null, payload);
            return;
          }
          let body: unknown;
          try {
            body = normaliseErrorPayload(
              reply.statusCode,
              payload,
              mode,
              options.logger ?? request.log,
            );
          } catch (error) {
            done(error as Error);
            return;
          }
          done(null, body);
        });
        // Payloads Fastify doesn't serialize (a string, bytes, a stream, a
        // web Response, nothing) skip `preSerialization`; under an error
        // status (a Response's own included) they are replaced with the
        // standard body here. JSON text is parsed and normalised like an
        // object.
        scope.addHook('onSend', (request, reply, payload, done) => {
          const status = sentStatus(reply.statusCode, payload);
          if (status < 400 || normalised.has(reply)) {
            done(null, payload);
            return;
          }
          const contentType = reply.getHeader('content-type');
          void reply.code(status).type('application/json; charset=utf-8');
          let body: string;
          try {
            body = rawErrorPayloadBody(
              status,
              payload,
              contentType,
              mode,
              options.logger ?? request.log,
            );
          } catch (error) {
            done(error as Error);
            return;
          }
          done(null, body);
        });

        for (const entry of catalog.entries) {
          const handler = byName[entry.name];
          const routeOptions: RouteOptions = {
            method: entry.method,
            url: entry.path,
            schema: routeSchema(entry),
            ...(entry.bodyLimit !== undefined
              ? { bodyLimit: entry.bodyLimit }
              : {}),
            handler: async (request: FastifyRequest, reply: FastifyReply) => {
              const input = {
                params: request.params,
                query: request.query,
                // A bodiless request skips parsing: a binary entry still
                // gets a (empty) Buffer, as its type says.
                body:
                  request.body ??
                  (entry.requestContentType ? Buffer.alloc(0) : {}),
              } as RequestInput<CatalogEntry>;
              return send(
                entry,
                await handler(input, request),
                reply,
                options.logger ?? request.log,
              );
            },
          };
          if (!entry.requestContentType) {
            scope.route(routeOptions);
            continue;
          }
          registerBinaryRoute(scope, entry.requestContentType, routeOptions);
        }
        resolve();
      }),
  );
}
