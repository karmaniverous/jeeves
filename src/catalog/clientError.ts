/**
 * Errors thrown by catalog requests and clients (spec 5.3, 5.4).
 *
 * @module
 */

import type { z } from 'zod';

import type { ErrorBody } from './errorBody.js';
import { retryAfterMs } from './retryAfter.js';

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
  /** Headers of the response, whenever one was received. */
  headers?: Headers;
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
  /** Headers of the response; absent when none was received (status 0). */
  readonly headers?: Headers;
  /**
   * Milliseconds to wait before retrying, from the response's `Retry-After`
   * (delta-seconds, or an HTTP date relative to when the error was built);
   * absent when the header is missing or unparseable.
   *
   * @remarks
   * Not capped: a server may ask for days. Cap it before passing it to
   * `setTimeout`, which fires delays above 2^31-1 ms (about 24.8 days)
   * after 1 ms.
   */
  readonly retryAfterMs?: number;

  /**
   * @param message - Error message.
   * @param details - Status, body, issues, cause and response headers.
   */
  constructor(message: string, details: CatalogClientErrorDetails) {
    super(message, { cause: details.cause });
    this.name = 'CatalogClientError';
    this.status = details.status;
    this.body = details.body;
    this.issues = details.issues;
    this.headers = details.headers;
    this.retryAfterMs = retryAfterMs(
      details.headers?.get('retry-after') ?? null,
      Date.now(),
    );
  }
}

/**
 * The error for input that fails an entry's schemas: status 0, the Zod
 * issues, and each issue's field and reason in the message, so a caller (or
 * a model calling a tool) can see what to correct.
 *
 * @param entryName - Catalog entry name.
 * @param issues - Zod issues.
 * @returns The error.
 */
export function invalidInputError(
  entryName: string,
  issues: z.core.$ZodIssue[],
): CatalogClientError {
  const details = issues
    .map((i) => `${i.path.map(String).join('.') || '(input)'}: ${i.message}`)
    .join('; ');
  return new CatalogClientError(
    `Invalid input for "${entryName}": ${details}`,
    { status: 0, issues },
  );
}
