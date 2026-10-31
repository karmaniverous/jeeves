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
} from 'fastify';
import type { z } from 'zod';

import { errorBodySchema } from '../catalog/errorBody.js';
import { isJsonContentType } from '../catalog/schemaHelpers.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import type {
  CatalogHandler,
  CatalogHandlers,
  CatalogRouteLogger,
  CatalogValidationIssue,
  HandlerResult,
  RegisterCatalogRoutesOptions,
  RequestInput,
} from './types.js';
import {
  isCatalogValidationError,
  type ValidationEntry,
  validatorCompiler,
} from './zodValidation.js';

/** Body of a strict-mode response mismatch (spec 5a.3). */
const RESPONSE_FAILED = {
  code: 'internal_error',
  error: 'Response validation failed',
} as const;

/** Fastify's names for the validated request parts, mapped to slots. */
const SLOT_OF = {
  params: 'params',
  querystring: 'query',
  body: 'body',
} as const;

/** Thrown by the serializer on a strict-mode mismatch; never escapes the scope. */
class ResponseMismatchError extends Error {
  /**
   * @param issues - Zod issues from the response parse.
   */
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('Response validation failed');
    this.name = 'ResponseMismatchError';
  }
}

/**
 * Request-validation issues from a Fastify validation error.
 *
 * @param error - Error carrying this module's validation entries.
 * @param context - Fastify's validation context (`body`, `querystring`,
 *   `params`).
 * @returns The issues.
 */
function issuesOf(
  error: { validation: ValidationEntry[] },
  context: string,
): CatalogValidationIssue[] {
  const slot = SLOT_OF[context as keyof typeof SLOT_OF];
  return error.validation.map((v) => ({
    slot,
    path: v.instancePath.split('/').filter(Boolean),
    code: v.keyword,
    message: v.message,
    params: v.params,
  }));
}

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
 * Send a handler result.
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
  if (result.headers) void reply.headers(result.headers);
  if (isJsonContentType(entry.contentType) || result.status >= 400)
    return reply.send(result.body);
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
 * The catalog scope's error handler: request-validation errors become a 400
 * with the formatted body, a strict response mismatch becomes core's 500,
 * and anything else is rethrown to the app's own error handler. Its reply
 * is the app's (spec 5.5), so it is sent as plain JSON, bypassing the
 * scope's response schemas.
 *
 * @param format - Validation error body formatter.
 * @param logger - Logger option, else the request's logger.
 * @returns The error handler.
 */
function errorHandlerFor(
  format: NonNullable<RegisterCatalogRoutesOptions['formatValidationError']>,
  logger: CatalogRouteLogger | undefined,
) {
  return (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (isCatalogValidationError(error))
      return reply
        .status(400)
        .send(format(issuesOf(error, error.validationContext), request));
    if (error instanceof ResponseMismatchError) {
      (logger ?? request.log).error(
        { issues: error.issues },
        'Response validation failed',
      );
      return reply.status(500).send(RESPONSE_FAILED);
    }
    // Strings go out as the app sent them; objects as JSON, typed as such
    // unless the app set a content type.
    reply.serializer((payload: unknown) => {
      if (typeof payload === 'string') return payload;
      if (!reply.hasHeader('content-type'))
        void reply.type('application/json; charset=utf-8');
      return JSON.stringify(payload);
    });
    throw error;
  };
}

/**
 * Register every catalog route on the app, in one encapsulated plugin whose
 * validator, serializer and error handler don't affect the rest of the app.
 *
 * @remarks
 * Auth isn't enforced here: register the component's auth hook on the root
 * app before calling this, so it applies to the catalog routes.
 *
 * @param app - Fastify app.
 * @param catalog - The catalog.
 * @param handlers - One handler per entry name.
 * @param options - Validation error body and response validation mode.
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
  const format =
    options.formatValidationError ??
    ((issues: CatalogValidationIssue[]) => ({
      error: 'Request validation failed',
      issues,
    }));
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
        scope.setErrorHandler(errorHandlerFor(format, options.logger));

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
