/**
 * Errors thrown by catalog requests and clients (spec 5.3, 5.4).
 *
 * @module
 */

import type { z } from 'zod';

import type { ErrorBody } from './errorBody.js';

/** What a {@link CatalogClientError} carries. */
export interface CatalogClientErrorDetails {
  /** HTTP status; `0` when no response was received or input was invalid. */
  status: number;
  /** Error body of a non-2xx response. */
  body?: ErrorBody;
  /** Zod issues: invalid input (status 0) or an unparseable 2xx response. */
  issues?: z.core.$ZodIssue[];
  /** Underlying error (abort, network failure). */
  cause?: unknown;
}

/**
 * A failed catalog request: invalid input, a non-2xx response, a response
 * that doesn't match its schema, or no response at all. Components' SDKs may
 * subclass it (e.g. the watcher's `WatcherError`).
 */
export class CatalogClientError extends Error {
  /** HTTP status; `0` when no response was received or input was invalid. */
  readonly status: number;
  /** Error body of a non-2xx response. */
  readonly body?: ErrorBody;
  /** Zod issues, when validation failed. */
  readonly issues?: z.core.$ZodIssue[];

  /**
   * @param message - Error message.
   * @param details - Status, body, issues and cause.
   */
  constructor(message: string, details: CatalogClientErrorDetails) {
    super(message, { cause: details.cause });
    this.name = 'CatalogClientError';
    this.status = details.status;
    this.body = details.body;
    this.issues = details.issues;
  }
}
