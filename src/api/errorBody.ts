/**
 * Builder for Fastify's standard error body (spec 5c.1), shared by core's
 * handlers and the catalog route scope.
 *
 * @module
 */

import { STATUS_CODES } from 'node:http';

import type { ErrorBody } from '../catalog/errorBody.js';

/**
 * The `message` of a 5xx that is not deliberate (an undeclared crash, raw
 * text, a stream, no body, a response mismatch); the cause is logged. A
 * deliberate 5xx keeps its own message (spec 5d.1).
 */
export const SERVER_ERROR_MESSAGE =
  'The server could not complete the request.';

/** Code of the 500 sent when a response doesn't match its schema. */
export const JEEVES_RESPONSE_VALIDATION = 'JEEVES_RESPONSE_VALIDATION';

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
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
  };
}
