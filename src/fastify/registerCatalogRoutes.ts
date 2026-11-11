/**
 * Catalog-driven Fastify route registration (spec 5.5).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifySchema } from 'fastify';
import type { z } from 'zod';

import { errorBodySchema } from '../catalog/errorBody.js';
import { isJsonContentType } from '../catalog/schemaHelpers.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import { errorHandlerFor } from './errorHandler.js';
import {
  isBuiltErrorBody,
  normaliseErrorPayload,
  rawErrorPayloadBody,
  ResponseMismatchError,
  setErrorHeaders,
} from './errorReply.js';
import type {
  CatalogHandler,
  CatalogHandlers,
  HandlerResult,
  RegisterCatalogRoutesOptions,
  RequestInput,
} from './types.js';
import { validatorCompiler } from './zodValidation.js';

/**
 * The serializer for one response schema.
 *
 * @param schema - Response schema for the status range.
 * @param mode - `strict` or `log`.
 * @param warn - Logs a `log`-mode mismatch.
 * @returns Payload to JSON string.
 */
function serializerFor(
  schema: z.ZodType,
  mode: 'strict' | 'log',
  warn: (issues: z.core.$ZodIssue[]) => void,
): (payload: unknown) => string {
  return (payload) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) return JSON.stringify(parsed.data);
    if (mode === 'strict') throw new ResponseMismatchError(parsed.error.issues);
    warn(parsed.error.issues);
    return JSON.stringify(payload);
  };
}

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
 * body, a 5xx masked and logged), like every other error reply.
 *
 * @param entry - Catalog entry.
 * @param result - Handler result.
 * @param reply - Fastify reply.
 * @returns The sent reply.
 */
function send(
  entry: CatalogEntry,
  result: HandlerResult<CatalogEntry>,
  reply: FastifyReply,
): FastifyReply {
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
 * with 5xx messages masked and logged; the app's own error handler is not
 * consulted (spec 5c.5).
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
        scope.setSerializerCompiler(({ schema, method, url, httpStatus }) =>
          serializerFor(schema as z.ZodType, mode, (issues) => {
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
          let body = payload;
          if (reply.statusCode >= 400 && !isBuiltErrorBody(payload))
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
          normalised.add(reply);
          done(null, body);
        });
        // Payloads Fastify doesn't serialize (a string, bytes, a stream,
        // nothing) skip `preSerialization`; under an error status they are
        // replaced with the standard body here.
        scope.addHook('onSend', (request, reply, payload, done) => {
          if (reply.statusCode < 400 || normalised.has(reply)) {
            done(null, payload);
            return;
          }
          void reply.type('application/json; charset=utf-8');
          done(
            null,
            rawErrorPayloadBody(
              reply.statusCode,
              payload,
              options.logger ?? request.log,
            ),
          );
        });

        for (const entry of catalog.entries) {
          const handler = byName[entry.name];
          scope.route({
            method: entry.method,
            url: entry.path,
            schema: routeSchema(entry),
            handler: async (request, reply) => {
              const input = {
                params: request.params,
                query: request.query,
                body: request.body ?? {},
              } as RequestInput<CatalogEntry>;
              return send(entry, await handler(input, request), reply);
            },
          });
        }
        resolve();
      }),
  );
}
