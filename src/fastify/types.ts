/**
 * Route registration types (spec 5.5).
 *
 * @module
 */

import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { ErrorBody } from '../catalog/errorBody.js';
import type { Catalog, CatalogEntry, IsJsonEntry } from '../catalog/types.js';

/** Successful HTTP status codes a handler may return. */
export type SuccessStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206;

/** Error HTTP status codes a handler may return. */
export type ErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 405
  | 406
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

/** Parsed value of an optional request slot schema; `{}` when absent. */
export type SlotValue<S> = S extends z.ZodType
  ? z.output<S>
  : Record<string, never>;

/** What a handler receives: the validated `params`, `query` and `body`. */
export interface RequestInput<E extends CatalogEntry> {
  /** Path parameters. */
  params: SlotValue<E['params']>;
  /** Query parameters. */
  query: SlotValue<E['query']>;
  /** Request body. */
  body: SlotValue<E['body']>;
}

/** Response headers a handler may set. */
export type ResponseHeaders = Record<string, string>;

/**
 * What a handler puts in an error result: the {@link ErrorBody} fields the
 * status doesn't determine. Route registration completes the body from the
 * status (`statusCode`, `error`), so a full `ErrorBody` fits too.
 */
export type HandlerErrorBody = Pick<ErrorBody, 'code' | 'message'>;

/**
 * What a handler returns: a success status with the entry's response, or an
 * error status with a {@link HandlerErrorBody}. Non-JSON entries return
 * bytes, text or a stream on success.
 *
 * @remarks
 * An error result is sent as Fastify's body,
 * `{ statusCode, code?, error, message }`, always JSON (a `content-type` in
 * its `headers` is ignored); on a 5xx the `message` is logged and replaced
 * with a generic one (spec 5c.5).
 */
export type HandlerResult<E extends CatalogEntry> =
  | {
      /** Success status. */
      status: SuccessStatus;
      /** Response body. */
      body: IsJsonEntry<E> extends true
        ? z.input<E['response']>
        : Uint8Array | string | NodeJS.ReadableStream;
      /** Extra response headers. */
      headers?: ResponseHeaders;
    }
  | {
      /** Error status. */
      status: ErrorStatus;
      /** Error message and code. */
      body: HandlerErrorBody;
      /** Extra response headers. */
      headers?: ResponseHeaders;
    };

/** Handler for one catalog entry. */
export type CatalogHandler<E extends CatalogEntry> = (
  input: RequestInput<E>,
  request: FastifyRequest,
) => Promise<HandlerResult<E>>;

/** One handler per catalog entry, keyed by entry name. */
export type CatalogHandlers<C extends Catalog> = {
  [E in C['entries'][number] as E['name']]: CatalogHandler<E>;
};

/** Where catalog routes log, when not Fastify's own logger (pino-compatible). */
export interface CatalogRouteLogger {
  /** Logs a `'log'`-mode response mismatch (an error body without a `message` included). */
  warn: (details: object, message: string) => void;
  /** Logs a `'strict'`-mode response mismatch and the cause of every 5xx. 4xx errors are not logged. */
  error: (details: object, message: string) => void;
}

/** Options for `registerErrorHandlers`. */
export interface RegisterErrorHandlersOptions {
  /**
   * Where the cause of a 5xx is logged (only `error` is called). Default:
   * Fastify's logger, which logs nothing when the app was created with
   * `logger: false`.
   */
  logger?: Pick<CatalogRouteLogger, 'error'>;
}

/** Options for `registerCatalogRoutes`. */
export interface RegisterCatalogRoutesOptions extends RegisterErrorHandlersOptions {
  /**
   * What a response that doesn't match its schema does: `'strict'`
   * (default) logs at `error` and replies 500; `'log'` logs at `warn` and
   * sends the handler's body unchanged.
   *
   * @remarks
   * Error bodies (any 4xx/5xx reply on a catalog route, a hook's included)
   * are always rebuilt from the reply status, a 5xx masked, in both modes.
   * One without a string `message` is a mismatch in `'strict'` mode; in
   * `'log'` mode it is sent with the status's generic message.
   */
  responseValidation?: 'strict' | 'log';
  /**
   * Where response mismatches and the causes of 5xx replies are logged.
   * Default: Fastify's logger, which logs nothing when the app was created
   * with `logger: false`.
   */
  logger?: CatalogRouteLogger;
}
