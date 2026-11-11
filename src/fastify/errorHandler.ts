/**
 * Fastify's standard error body for every error (spec 5c.1, 5c.5).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from '../api/errorBody.js';
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
 * The reply status for a thrown value: its `statusCode` (or, when absent,
 * its `status`, as Fastify reads it) when an integer from 400 to 599, else
 * 500.
 *
 * @param thrown - The thrown value's fields.
 * @returns The status.
 */
function statusOf({ statusCode, status }: ThrownFields): number {
  const candidate = statusCode ?? status;
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
    ? candidate
    : 500;
}

/**
 * An error handler answering every error in Fastify's body: 4xx keep their
 * `message` and `code`; 5xx keep their `code`, get a generic `message`, and
 * the error is logged. The error's `headers` (e.g. `Retry-After`) are
 * applied. A strict response mismatch is a 500 with code
 * `JEEVES_RESPONSE_VALIDATION`; its Zod issues are logged only.
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
        errorReplyBody(
          500,
          SERVER_ERROR_MESSAGE,
          JEEVES_RESPONSE_VALIDATION,
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
    const status = statusOf(fields);
    setErrorHeaders(reply, fields.headers);
    return reply
      .status(status)
      .send(
        errorReplyBody(
          status,
          typeof fields.message === 'string' ? fields.message : '',
          fields.code,
          log,
          { details: { err: error }, message: 'Request failed' },
        ),
      );
  };
}

/**
 * Make the app's error handler send Fastify's standard error body, with the
 * `message` of every 5xx replaced by a generic one and the error logged.
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
