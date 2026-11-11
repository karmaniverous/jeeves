/**
 * Fastify's standard error body for every error (spec 5c.1, 5c.5).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import {
  errorBody,
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from '../api/errorBody.js';
import type {
  CatalogRouteLogger,
  RegisterErrorHandlersOptions,
} from './types.js';

/** Thrown by the serializer on a strict-mode mismatch; never escapes the scope. */
export class ResponseMismatchError extends Error {
  /**
   * @param issues - Zod issues from the response parse.
   */
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('Response validation failed');
    this.name = 'ResponseMismatchError';
  }
}

/** The fields of a thrown value the reply is built from. */
interface ThrownFields {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
}

/**
 * The reply status for a thrown value: its `statusCode` when an integer
 * from 400 to 599, else 500.
 *
 * @param statusCode - The thrown value's `statusCode`.
 * @returns The status.
 */
function statusOf(statusCode: unknown): number {
  return typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
    ? statusCode
    : 500;
}

/**
 * An error handler answering every error in Fastify's body: 4xx keep their
 * `message` and `code`; 5xx keep their `code`, get a generic `message`, and
 * the error is logged. A strict response mismatch is a 500 with code
 * `JEEVES_RESPONSE_VALIDATION`; its Zod issues are logged only.
 *
 * @param logger - Where 5xx causes are logged; default the request's logger.
 * @returns The handler, for `setErrorHandler`.
 */
export function errorHandlerFor(
  logger: CatalogRouteLogger | undefined,
): (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => FastifyReply {
  return (error, request, reply) => {
    const log = logger ?? request.log;
    if (error instanceof ResponseMismatchError) {
      log.error({ issues: error.issues }, 'Response validation failed');
      return reply
        .status(500)
        .send(errorBody(500, SERVER_ERROR_MESSAGE, JEEVES_RESPONSE_VALIDATION));
    }
    const { statusCode, code, message } = (
      typeof error === 'object' && error !== null ? error : {}
    ) as ThrownFields;
    const status = statusOf(statusCode);
    const kept = typeof code === 'string' ? code : undefined;
    if (status >= 500) {
      log.error({ err: error }, 'Request failed');
      return reply
        .status(status)
        .send(errorBody(status, SERVER_ERROR_MESSAGE, kept));
    }
    return reply
      .status(status)
      .send(
        errorBody(status, typeof message === 'string' ? message : '', kept),
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
