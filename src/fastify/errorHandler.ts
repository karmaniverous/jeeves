/**
 * Fastify's standard error body for every error (spec 5c.1, 5c.5, 5d.1).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { JEEVES_RESPONSE_VALIDATION } from '../api/errorBody.js';
import {
  errorReplyBody,
  ResponseMismatchError,
  setErrorHeaders,
} from './errorReply.js';
import type {
  CatalogRouteLogger,
  RegisterErrorHandlersOptions,
} from './types.js';

/** The fields of a thrown value the reply is built from. */
interface ThrownFields {
  statusCode?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
  headers?: unknown;
}

/**
 * The error status a thrown value declares: its `statusCode` (or, when
 * absent, its `status`, as Fastify reads it) when an integer from 400 to
 * 599.
 *
 * @param thrown - The thrown value's fields.
 * @returns The status, or `undefined` when it declares none (an unexpected
 *   crash, answered as a 500).
 */
function declaredStatus({
  statusCode,
  status,
}: ThrownFields): number | undefined {
  const candidate = statusCode ?? status;
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
    ? candidate
    : undefined;
}

/**
 * An error handler answering every error in Fastify's body. An error that
 * declares its status (`statusCode`, or `status`, from 400 to 599; a
 * `createError` error does) is deliberate: it keeps its `message` and
 * `code`, on a 4xx or a 5xx, so a deliberate 5xx's message reaches the
 * client and must be written for the caller, with no internals in it. An
 * error that declares none is an unexpected crash: a 500 with the generic
 * `message` and no `code`, so neither its text nor a system code such as
 * `ENOENT` reaches the client. Every 5xx is logged. The error's `headers`
 * (e.g. `Retry-After`) are applied. A strict response mismatch is a 500
 * with the generic message and code `JEEVES_RESPONSE_VALIDATION`; its Zod
 * issues are logged only.
 *
 * @param logger - Where 5xx causes are logged; default the request's logger.
 * @returns The handler, for `setErrorHandler`.
 */
export function errorHandlerFor(
  logger: Pick<CatalogRouteLogger, 'error'> | undefined,
): (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => FastifyReply {
  return (error, request, reply) => {
    const log = logger ?? request.log;
    if (error instanceof ResponseMismatchError)
      return reply.status(500).send(
        // Not deliberate: masked, so the mismatch never reaches the client.
        errorReplyBody(
          500,
          error.message,
          JEEVES_RESPONSE_VALIDATION,
          false,
          log,
          {
            details: { issues: error.issues },
            message: 'Response validation failed',
          },
        ),
      );
    const fields = (
      typeof error === 'object' && error !== null ? error : {}
    ) as ThrownFields;
    const declared = declaredStatus(fields);
    const status = declared ?? 500;
    setErrorHeaders(reply, fields.headers);
    return reply
      .status(status)
      .send(
        errorReplyBody(
          status,
          typeof fields.message === 'string' ? fields.message : '',
          declared === undefined ? undefined : fields.code,
          declared !== undefined,
          log,
          { details: { err: error }, message: 'Request failed' },
        ),
      );
  };
}

/**
 * Make the app's error handler send Fastify's standard error body, by the
 * catalog's rule: an error that declares its status keeps its `message` and
 * `code` (a deliberate 5xx included); an undeclared crash is a 500 with a
 * generic `message` and no `code`. Every 5xx is logged.
 *
 * @remarks
 * Catalog routes answer their own errors this way already; this covers the
 * app's other routes. Call it on the root app before registering routes.
 * Encapsulated plugins that set their own error handler keep it.
 *
 * @param app - Fastify app.
 * @param options - Where 5xx causes are logged.
 */
export function registerErrorHandlers(
  app: FastifyInstance,
  options: RegisterErrorHandlersOptions = {},
): void {
  app.setErrorHandler(errorHandlerFor(options.logger));
}
