/**
 * Catalog-driven Fastify route registration (spec 5.5).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifySchema } from 'fastify';
import type { z } from 'zod';

import { errorBody, SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import { errorBodySchema } from '../catalog/errorBody.js';
import { isJsonContentType } from '../catalog/schemaHelpers.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import { errorHandlerFor, ResponseMismatchError } from './errorHandler.js';
import type {
  CatalogHandler,
  CatalogHandlers,
  CatalogRouteLogger,
  HandlerErrorBody,
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
 * Fastify route schema for an entry.
 *
 * @param entry - Catalog entry.
 * @returns Its schema.
 */
function routeSchema(entry: CatalogEntry): FastifySchema {
  return {
    ...(entry.params ? { params: entry.params } : {}),
    ...(entry.query ? { querystring: entry.query } : {}),
    ...(entry.body ? { body: entry.body } : {}),
    ...(isJsonContentType(entry.contentType)
      ? {
          response: {
            '2xx': entry.response,
            '4xx': errorBodySchema,
            '5xx': errorBodySchema,
          },
        }
      : {}),
  };
}

/**
 * Send a handler result. An error result goes out as Fastify's body, built
 * from the status; a 5xx's message is logged and replaced with the generic
 * one.
 *
 * @param entry - Catalog entry.
 * @param result - Handler result.
 * @param reply - Fastify reply.
 * @param log - Where a 5xx's message is logged.
 * @returns The sent reply.
 */
function send(
  entry: CatalogEntry,
  result: HandlerResult<CatalogEntry>,
  reply: FastifyReply,
  log: CatalogRouteLogger,
): FastifyReply {
  const { status } = result;
  reply.status(status);
  if (result.headers) void reply.headers(result.headers);
  if (status >= 400) {
    const { code, message } = result.body as HandlerErrorBody;
    if (status < 500) return reply.send(errorBody(status, message, code));
    log.error({ statusCode: status, code, message }, 'Handler returned 5xx');
    return reply.send(errorBody(status, SERVER_ERROR_MESSAGE, code));
  }
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
 * strict response mismatch, an error result) is answered in Fastify's body,
 * `{ statusCode, code?, error, message }`, with 5xx messages masked and
 * logged; the app's own error handler is not consulted (spec 5c.5).
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
              return send(
                entry,
                await handler(input, request),
                reply,
                options.logger ?? request.log,
              );
            },
          });
        }
        resolve();
      }),
  );
}
