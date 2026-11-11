/**
 * Fastify's standard error body for every error (spec 5c.1, 5c.5, 5d.1).
 *
 * @module
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from '../api/errorBody.js';
import { isDeliberateError } from './defineError.js';
import {
  errorReplyBody,
  ResponseMismatchError,
  setErrorHeaders,
} from './errorReply.js';
import type {
  CatalogRouteLogger,
  RegisterErrorHandlersOptions,
} from './types.js';

/** The fields of a thrown value a trusted reply is built from. */
interface ThrownFields {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  headers?: unknown;
}

/**
 * The only headers a trusted thrown error sets (lower case): they tell the
 * caller when to retry, how to authenticate and which methods are allowed.
 */
const ALLOWED_ERROR_HEADERS = new Set([
  'retry-after',
  'www-authenticate',
  'allow',
]);

/**
 * Prefix of Fastify's own error codes. Trust by this prefix rests on
 * Fastify's naming convention, not on proof that Fastify made the error: a
 * plugin using the same prefix on a 4xx is trusted too.
 */
const FASTIFY_CODE_PREFIX = 'FST_ERR_';

/**
 * Whether a value is an integer HTTP status from 400 to `max`.
 *
 * @param value - The candidate.
 * @param max - Highest status accepted.
 * @returns `true` when in range.
 */
function isStatusUpTo(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= max
  );
}

/**
 * Whether a thrown value is trusted (spec 5d.1): branded by
 * {@link defineError} (from any copy of core), or a 4xx whose `code` begins
 * `FST_ERR_` (Fastify's naming convention for its own errors, such as a
 * validation failure or a malformed, oversized or wrongly typed body; core
 * can't check who made it without loading `fastify`). Fastify's 5xx are
 * internal.
 *
 * @param thrown - The thrown value.
 * @param fields - Its fields.
 * @returns `true` when its status, code and message are sent as written.
 */
function isTrusted(thrown: unknown, fields: ThrownFields): boolean {
  if (isDeliberateError(thrown)) return true;
  return (
    typeof fields.code === 'string' &&
    fields.code.startsWith(FASTIFY_CODE_PREFIX) &&
    isStatusUpTo(fields.statusCode, 499)
  );
}

/**
 * A thrown error's headers on the allowlist (`Retry-After`,
 * `WWW-Authenticate`, `Allow`, any case).
 *
 * @param headers - The error's `headers`.
 * @returns The allowed ones; `undefined` unless an object.
 */
function allowedHeaders(headers: unknown): object | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      ALLOWED_ERROR_HEADERS.has(name.toLowerCase()),
    ),
  );
}

/** How a thrown value is answered. */
interface ThrownReply {
  /** Reply status. */
  status: number;
  /** Body `message`. */
  message: string;
  /** Body `code`, if any. */
  code: unknown;
  /** Headers the reply takes from the error. */
  headers: object | undefined;
  /** Whether the reply is masked (the error is not trusted). */
  masked: boolean;
}

/**
 * The one decision on a thrown value (spec 5d.1).
 *
 * - **Trusted** (a {@link defineError} error; a 4xx `FST_ERR_*`, by
 *   Fastify's naming convention): its
 *   `statusCode` when an integer from 400 to 599, else 500; its `code` and
 *   `message`; its allowlisted headers.
 * - **Anything else**, whatever status, code or headers it carries: a 500
 *   with {@link SERVER_ERROR_MESSAGE}, no `code` and no headers.
 *
 * @param thrown - The thrown value.
 * @returns How it is answered.
 */
function thrownReply(thrown: unknown): ThrownReply {
  const fields = (
    typeof thrown === 'object' && thrown !== null ? thrown : {}
  ) as ThrownFields;
  if (!isTrusted(thrown, fields))
    return {
      status: 500,
      message: SERVER_ERROR_MESSAGE,
      code: undefined,
      headers: undefined,
      masked: true,
    };
  return {
    status: isStatusUpTo(fields.statusCode, 599) ? fields.statusCode : 500,
    message: typeof fields.message === 'string' ? fields.message : '',
    code: fields.code,
    headers: allowedHeaders(fields.headers),
    masked: false,
  };
}

/**
 * An error handler answering every error in Fastify's body (spec 5d.1).
 *
 * - **Trusted:** an error made by a {@link defineError} class keeps its
 *   status (400 to 599, else 500), `code`, `message` and its `Retry-After`,
 *   `WWW-Authenticate` and `Allow` headers, on a 4xx or a 5xx. A 4xx whose
 *   `code` begins `FST_ERR_` (Fastify's naming convention for its own
 *   errors: validation, malformed or oversized body, media type) keeps
 *   them too.
 * - **Masked:** every other thrown error (a plain `Error`, a plain
 *   `createError` error, `http-errors`, a client library's error such as
 *   undici's or axios's, Fastify's own 5xx) is a 500 with the generic
 *   `message`, no `code` and none of its headers, whatever it carries.
 *
 * Every 5xx is logged with the error, as `Error reply` when its message is
 * sent and `Error reply masked` when it is not. Headers already on the reply
 * are left alone. A strict response mismatch is a 500 with the generic
 * message and code `JEEVES_RESPONSE_VALIDATION`; its Zod issues are logged
 * only.
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
    const { status, message, code, headers, masked } = thrownReply(error);
    setErrorHeaders(reply, headers);
    return reply.status(status).send(
      errorReplyBody(status, message, code, log, {
        deliberate: !masked,
        cause: { details: { err: error } },
      }),
    );
  };
}

/**
 * Make the app's error handler send Fastify's standard error body, by the
 * catalog's rule (spec 5d.1): an error made by a {@link defineError} class
 * (or a 4xx of Fastify's own) keeps its status, `message`, `code` and
 * allowlisted headers, a 5xx included; every other thrown error is a 500
 * with a generic `message`, no `code` and none of its headers. Every 5xx is
 * logged.
 *
 * @remarks
 * Catalog routes answer their own errors this way already; this covers the
 * app's other routes. Call it on the root app before registering routes.
 * Encapsulated plugins that set their own error handler keep it.
 *
 * The rule applies to every plugin's errors on the app, too: a plugin that
 * throws a plain status-bearing error (`@fastify/rate-limit`'s 429,
 * `@fastify/static`'s 403, `@fastify/multipart`'s 413, `@fastify/jwt`'s
 * 401, `@fastify/sensible`'s `httpErrors`) gets a masked 500. Map such
 * errors to `defineError` classes (rate-limit's `errorResponseBuilder` can
 * return one).
 *
 * Not covered: when a hook (`onSend`, `preSerialization`) throws again
 * while an error reply is being sent, Fastify gives up on every error
 * handler and serializes that hook's error itself. Catalog routes mask that
 * fallback through their error serializer; other routes can't be protected
 * from it, so the hook's own `message`, `code` and status go out as is.
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
