/**
 * The one place a catalog error reply's body is built (spec 5c.1, 5c.5):
 * `statusCode` and `error` from the reply status, `code` kept, `message`
 * kept on a 4xx and replaced with the generic one on a 5xx, whose cause is
 * logged.
 *
 * @module
 */

import { STATUS_CODES } from 'node:http';

import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { errorBody, SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import type { ErrorBody } from '../catalog/errorBody.js';
import type { CatalogRouteLogger } from './types.js';

/** Thrown on a strict-mode error-reply mismatch; never escapes the scope. */
export class ResponseMismatchError extends Error {
  /**
   * @param issues - Zod issues from the response parse.
   */
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('Response validation failed');
    this.name = 'ResponseMismatchError';
  }
}

/** What a 5xx's cause is logged as. */
export interface ErrorCause {
  /** Log details (e.g. `{ err }`). */
  details: object;
  /** Log message. */
  message: string;
}

/**
 * Bodies {@link errorReplyBody} built. They already carry their reply's
 * status and masking, so the scope's hooks pass them on unchanged (and a
 * 5xx cause isn't logged twice).
 */
const builtBodies = new WeakSet();

/**
 * The `code` an error reply keeps: any string `code`, on a 4xx or a 5xx.
 *
 * @remarks
 * Owner decision pending (review 5853988629 N2): a 5xx keeps a code that
 * isn't a deliberate one too (e.g. Node's `ENOENT`). Narrowing that is a
 * change to this function alone.
 *
 * @param code - The error's `code`.
 * @returns The code sent, or `undefined`.
 */
function keptCode(code: unknown): string | undefined {
  return typeof code === 'string' ? code : undefined;
}

/**
 * The body of an error reply with this status: Fastify's
 * `{ statusCode, code?, error, message }`. On a 5xx the message is replaced
 * with {@link SERVER_ERROR_MESSAGE} and the cause is logged at `error`.
 *
 * @param status - Reply status (400 to 599).
 * @param message - The error's message.
 * @param code - The error's `code`; kept when a string.
 * @param log - Where a 5xx's cause is logged.
 * @param cause - What a 5xx's cause is logged as; default its status, code
 *   and message.
 * @returns The body.
 */
export function errorReplyBody(
  status: number,
  message: string,
  code: unknown,
  log: Pick<CatalogRouteLogger, 'error'>,
  cause: ErrorCause = {
    details: { statusCode: status, code, message },
    message: 'Error reply masked',
  },
): ErrorBody {
  const kept = keptCode(code);
  if (status >= 500) log.error(cause.details, cause.message);
  const body = errorBody(
    status,
    status >= 500 ? SERVER_ERROR_MESSAGE : message,
    kept,
  );
  builtBodies.add(body);
  return body;
}

/**
 * Whether {@link errorReplyBody} built this payload.
 *
 * @param payload - A reply payload.
 * @returns `true` when it is final.
 */
export function isBuiltErrorBody(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
    ? builtBodies.has(payload)
    : false;
}

/**
 * What makes an error reply body normalisable: a string `message`.
 *
 * @remarks
 * Decision (spec 5c.1; review 5853988629 S3): a body without one, such as
 * 0.9's `{ error: 'Unauthorized' }`, is not coerced from `error` (Fastify's
 * status text); it is a response mismatch. To coerce instead, replace this
 * schema with
 * `z.object({ message: z.string() }).or(z.object({ error: z.string() }).transform(({ error }) => ({ message: error })))`.
 */
const messageSchema = z.object({ message: z.string() });

/**
 * Normalise an object payload sent with an error status (a handler result,
 * or a reply a hook sent): rebuilt by {@link errorReplyBody} from the
 * status, its `message` and its `code`.
 *
 * @remarks
 * A payload without a string `message` throws a
 * {@link ResponseMismatchError} in `'strict'` mode (answered with the
 * mismatch 500); in `'log'` mode it gets the status's generic message and a
 * warning is logged.
 *
 * @param status - Reply status (400 to 599).
 * @param payload - The payload.
 * @param mode - Response validation mode.
 * @param log - Where mismatches and 5xx causes are logged.
 * @returns The body.
 * @throws {@link ResponseMismatchError} in `'strict'` mode, for a payload
 *   without a string `message`.
 */
export function normaliseErrorPayload(
  status: number,
  payload: unknown,
  mode: 'strict' | 'log',
  log: CatalogRouteLogger,
): ErrorBody {
  const { code } = (
    typeof payload === 'object' && payload !== null ? payload : {}
  ) as { code?: unknown };
  const parsed = messageSchema.safeParse(payload);
  if (parsed.success)
    return errorReplyBody(status, parsed.data.message, code, log);
  if (mode === 'strict') throw new ResponseMismatchError(parsed.error.issues);
  log.warn(
    { statusCode: status, issues: parsed.error.issues },
    'Error body has no message (log mode): sent with the generic one',
  );
  return errorReplyBody(status, STATUS_CODES[status] ?? 'Error', code, log);
}

/**
 * The standard body for a payload Fastify sends without serializing it (a
 * string, bytes, a stream, nothing) under an error status: a 4xx keeps the
 * text as its `message` (else the status text); a 5xx is masked and its
 * text logged. A stream is destroyed unread.
 *
 * @param status - Reply status (400 to 599).
 * @param payload - The raw payload.
 * @param log - Where a 5xx's text is logged.
 * @returns The body, as JSON.
 */
export function rawErrorPayloadBody(
  status: number,
  payload: unknown,
  log: Pick<CatalogRouteLogger, 'error'>,
): string {
  let message = STATUS_CODES[status] ?? 'Error';
  if (typeof payload === 'string') message = payload;
  else if (payload instanceof Uint8Array)
    message = Buffer.from(payload).toString('utf8');
  else if (
    typeof (payload as { destroy?: unknown } | null | undefined)?.destroy ===
    'function'
  )
    (payload as { destroy: () => void }).destroy();
  return JSON.stringify(errorReplyBody(status, message, undefined, log));
}

/**
 * Apply an error's or error result's headers to the reply, as Fastify does
 * for a thrown error's `headers`: string and number values only, and never
 * `content-type` (an error body is always JSON).
 *
 * @param reply - Fastify reply.
 * @param headers - The headers; ignored unless an object.
 */
export function setErrorHeaders(reply: FastifyReply, headers: unknown): void {
  if (typeof headers !== 'object' || headers === null) return;
  for (const [name, value] of Object.entries(headers))
    if (
      (typeof value === 'string' || typeof value === 'number') &&
      name.toLowerCase() !== 'content-type'
    )
      void reply.header(name, value);
}
