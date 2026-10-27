/**
 * Route registration types (spec 5.5).
 *
 * @module
 */

import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { ErrorBody } from '../catalog/errorBody.js';
import type { RequestSlot } from '../catalog/schemaHelpers.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';

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
 * What a handler returns: a success status with the entry's response, or an
 * error status with an {@link ErrorBody}. Non-JSON entries return bytes,
 * text or a stream on success.
 */
export type HandlerResult<E extends CatalogEntry> =
  | {
      /** Success status. */
      status: SuccessStatus;
      /** Response body. */
      body: E['contentType'] extends string
        ? E['contentType'] extends `${string}json${string}`
          ? z.input<E['response']>
          : Uint8Array | string | NodeJS.ReadableStream
        : z.input<E['response']>;
      /** Extra response headers. */
      headers?: ResponseHeaders;
    }
  | {
      /** Error status. */
      status: ErrorStatus;
      /** Error body. */
      body: ErrorBody;
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

/** One request-validation problem. */
export interface CatalogValidationIssue {
  /** Which part of the request was invalid. */
  slot: RequestSlot;
  /** Path to the invalid value within that part. */
  path: string[];
  /** Zod issue code. */
  code: string;
  /** Human-readable message. */
  message: string;
}

/** Options for `registerCatalogRoutes`. */
export interface RegisterCatalogRoutesOptions {
  /**
   * Body for a 400 reply to an invalid request. Default
   * `{ error: 'Request validation failed', issues }`.
   */
  formatValidationError?: (
    issues: CatalogValidationIssue[],
    request: FastifyRequest,
  ) => ErrorBody;
  /**
   * What a response that doesn't match its schema does: `'strict'`
   * (default) logs at `error` and replies 500; `'log'` logs at `warn` and
   * sends the handler's body unchanged.
   */
  responseValidation?: 'strict' | 'log';
}
