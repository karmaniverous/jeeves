/**
 * Fastify's standard error body for every error (spec 5c.1, 5c.5, 5d.1).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
  statusText,
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
  expose?: unknown;
  code?: unknown;
  message?: unknown;
  headers?: unknown;
}

/**
 * Whether a value is an error status: an integer from 400 to 599.
 *
 * @param value - The candidate.
 * @returns `true` for an error status.
 */
function isErrorStatus(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  );
}

/** How a thrown value is answered. */
interface ThrownReply {
  /**
   * Reply status: the error's `statusCode` (or, when absent, its `status`,
   * as Fastify reads it) when an error status, else 500.
   */
  status: number;
  /**
   * Whether the error is deliberate, so its `message` and `code` were
   * written for the caller: it has its own error-status `statusCode` (as
   * `createError` sets it) and is not marked `expose: false` (the
   * `http-errors` convention).
   */
  deliberate: boolean;
}

/**
 * The one decision on a thrown value (spec 5d.1): its reply status, and
 * whether it is deliberate. An error carrying only `status` (a third-party
 * client's, such as Qdrant's `ApiError` or axios's) or marked
 * `expose: false` sets the status but is not deliberate.
 *
 * @param thrown - The thrown value's fields.
 * @returns The status and whether it is deliberate.
 */
function thrownReply({
  statusCode,
  status,
  expose,
}: ThrownFields): ThrownReply {
  const candidate = statusCode ?? status;
  return {
    status: isErrorStatus(candidate) ? candidate : 500,
    deliberate: isErrorStatus(statusCode) && expose !== false,
  };
}

/**
 * An error handler answering every error in Fastify's body (spec 5d.1).
 *
 * - **Status:** the error's `statusCode`, or when absent its `status`, when
 *   an integer from 400 to 599; else 500.
 * - **Deliberate** (its own `statusCode` from 400 to 599, as `createError`
 *   sets it, and not `expose: false`): keeps its `message` and `code` on a
 *   4xx or a 5xx, so a deliberate 5xx's message reaches the client and must
 *   be written for the caller.
 * - **Not deliberate, 5xx** (no error status, `status` only, or
 *   `expose: false`): the generic `message` and no `code`, so neither a
 *   library's text (e.g. an internal URL) nor a system code such as
 *   `ENOENT` reaches the client.
 * - **Not deliberate, 4xx:** keeps its `code`, and its `message` unless
 *   marked `expose: false`, when the message is the status text.
 *
 * Every 5xx is logged. The error's `headers` (e.g. `Retry-After`) are
 * applied. A strict response mismatch is a 500 with the generic message and
 * code `JEEVES_RESPONSE_VALIDATION`; its Zod issues are logged only.
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
            deliberate: false,
            cause: {
              details: { issues: error.issues },
              message: 'Response validation failed',
            },
          },
        ),
      );
    const fields = (
      typeof error === 'object' && error !== null ? error : {}
    ) as ThrownFields;
    const { status, deliberate } = thrownReply(fields);
    const crash = status >= 500 && !deliberate;
    const hidden = status < 500 && fields.expose === false;
    const message = typeof fields.message === 'string' ? fields.message : '';
    setErrorHeaders(reply, fields.headers);
    return reply.status(status).send(
      errorReplyBody(
        status,
        hidden ? statusText(status) : message,
        crash ? undefined : fields.code,
        log,
        {
          deliberate,
          cause: { details: { err: error }, message: 'Request failed' },
        },
      ),
    );
  };
}

/**
 * Make the app's error handler send Fastify's standard error body, by the
 * catalog's rule (spec 5d.1): a deliberate error (its own `statusCode` from
 * 400 to 599, not `expose: false`; a `createError` error) keeps its
 * `message` and `code`, a 5xx included; any other 5xx gets a generic
 * `message` and no `code`. Every 5xx is logged.
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
