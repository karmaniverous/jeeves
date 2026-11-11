/**
 * Deliberate errors, trusted by definition (spec 5d.1).
 *
 * @module
 */

import createError, { type FastifyErrorConstructor } from '@fastify/error';

import type { ErrorStatus } from './types.js';

/**
 * The brand {@link defineError} puts on its classes' prototypes. A
 * `Symbol.for` key, so an error defined with one copy of core is trusted
 * by another (a service and a library depending on different copies).
 */
const DELIBERATE_ERROR: unique symbol = Symbol.for(
  '@karmaniverous/jeeves/deliberate',
);

/** Options for {@link defineError}, passed on to `createError`. */
export interface DefineErrorOptions {
  /** The class to extend; default `Error`. */
  base?: ErrorConstructor;
  /** Whether instances capture a stack trace; default `true`. */
  captureStackTrace?: boolean;
}

/**
 * Define a deliberate error: a `@fastify/error` `createError` class whose
 * errors a catalog scope (and `registerErrorHandlers`) sends to the client
 * as written, on a 4xx or a 5xx.
 *
 * @remarks
 * Trust is declared here, where the error is defined, because a library's
 * error can't be told from a deliberate one by its properties. A thrown
 * error made by a class from this function keeps its status, `code` and
 * `message`, and its `Retry-After`, `WWW-Authenticate` and `Allow`
 * headers. Every other thrown error (a plain `Error`, a plain
 * `createError` error, `http-errors`, a client library's error) is a
 * masked 500 with no `code` and none of its headers. So write the message
 * for the caller: never interpolate internals (paths, hosts, credentials).
 *
 * @example
 * ```ts
 * const ScanInProgress = defineError(
 *   'WATCHER_SCAN_IN_PROGRESS',
 *   'A scan is in progress; retry when it finishes',
 *   503,
 * );
 * throw Object.assign(new ScanInProgress(), { headers: { 'retry-after': '30' } });
 * ```
 *
 * @param code - Machine-readable code, upper case in Fastify's style
 *   (`RUNNER_JOB_EXISTS`); clients branch on it.
 * @param message - Caller-facing message, a `util.format` template whose
 *   `%s` placeholders take the constructor's arguments.
 * @param status - HTTP status, 400 to 599.
 * @param options - Base class and stack-trace capture.
 * @returns The error class, callable with or without `new`.
 */
export function defineError<C extends string, S extends ErrorStatus>(
  code: C,
  message: string,
  status: S,
  options: DefineErrorOptions = {},
): FastifyErrorConstructor<{
  /** The error's code, as given. */
  code: C;
  /** The error's HTTP status, as given. */
  statusCode: S;
}> {
  const ErrorClass = createError(
    code,
    message,
    status,
    options.base,
    options.captureStackTrace,
  );
  Object.defineProperty(ErrorClass.prototype, DELIBERATE_ERROR, {
    value: true,
  });
  return ErrorClass;
}

/**
 * Whether a thrown value carries the {@link defineError} brand, from any
 * copy of core.
 *
 * @param value - The thrown value.
 * @returns `true` for a deliberate error.
 */
export function isDeliberateError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[DELIBERATE_ERROR] === true
  );
}
