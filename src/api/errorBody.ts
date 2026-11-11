/**
 * Builder for Fastify's standard error body (spec 5c.1), shared by core's
 * handlers and the catalog route scope.
 *
 * @module
 */

import { STATUS_CODES } from 'node:http';

import type { ErrorBody } from '../catalog/errorBody.js';

/**
 * The `message` of a masked 5xx (an untrusted thrown error, raw text, a
 * stream, no body, a response mismatch); the cause is logged. A trusted
 * thrown error (`defineError`) and an error result keep their own message
 * (spec 5d.1).
 */
export const SERVER_ERROR_MESSAGE =
  'The server could not complete the request.';

/** Code of the 500 sent when a response doesn't match its schema. */
export const JEEVES_RESPONSE_VALIDATION = 'JEEVES_RESPONSE_VALIDATION';

/**
 * The standard status text (`Not Found`), or `Error` for a status Node
 * doesn't name.
 *
 * @param statusCode - HTTP status.
 * @returns The status text.
 */
export function statusText(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}

/**
 * An error body: Fastify's `{ statusCode, code?, error, message }`, with
 * `error` the standard status text.
 *
 * @param statusCode - HTTP status.
 * @param message - Human-readable message.
 * @param code - Machine-readable code; omitted when undefined.
 * @returns The body.
 */
export function errorBody(
  statusCode: number,
  message: string,
  code?: string,
): ErrorBody {
  return {
    statusCode,
    ...(code === undefined ? {} : { code }),
    error: statusText(statusCode),
    message,
  };
}
