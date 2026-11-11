/**
 * The one place a catalog error reply's body is built (spec 5c.1, 5c.5,
 * 5d.1): `statusCode` and `error` from the reply status, `code` kept,
 * `message` kept on a 4xx and on a deliberate 5xx, and replaced with the
 * generic one on any other 5xx. Every 5xx's cause is logged.
 *
 * @module
 */

import {
  STATUS_CODES,
  validateHeaderName,
  validateHeaderValue,
} from 'node:http';

import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { errorBody, SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import type { ErrorBody } from '../catalog/errorBody.js';
import { isJsonContentType } from '../catalog/schemaHelpers.js';
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
 * `{ statusCode, code?, error, message }`. Every 5xx's cause is logged at
 * `error`. A 5xx's message is kept when the reply is deliberate (spec 5d.1:
 * a thrown error that declares its status, a handler error result, a
 * standard error body sent from a hook) and replaced with
 * {@link SERVER_ERROR_MESSAGE} otherwise (an undeclared crash, raw text, a
 * stream, a web `Response`, no body, a response mismatch).
 *
 * @param status - Reply status (400 to 599).
 * @param message - The error's message.
 * @param code - The error's `code`; kept when a string.
 * @param deliberate - Whether the reply's message was written for the
 *   caller; when `false`, a 5xx's message is masked. A 4xx's message is
 *   always kept.
 * @param log - Where a 5xx's cause is logged.
 * @param cause - What a 5xx's cause is logged as; default its status, code
 *   and message.
 * @returns The body.
 */
export function errorReplyBody(
  status: number,
  message: string,
  code: unknown,
  deliberate: boolean,
  log: Pick<CatalogRouteLogger, 'error'>,
  cause: ErrorCause = {
    details: { statusCode: status, code, message },
    message: 'Error reply masked',
  },
): ErrorBody {
  const kept = keptCode(code);
  const masked = status >= 500 && !deliberate;
  if (status >= 500) log.error(cause.details, cause.message);
  const body = errorBody(status, masked ? SERVER_ERROR_MESSAGE : message, kept);
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
 * status, its `message` and its `code`. Such a body is deliberate: a 5xx
 * keeps its `message` (spec 5d.1), so write it for the caller.
 *
 * @remarks
 * A payload without a string `message` throws a
 * {@link ResponseMismatchError} in `'strict'` mode (answered with the
 * mismatch 500); in `'log'` mode it gets the status text as its message (a
 * 5xx the generic one) and a warning is logged.
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
    return errorReplyBody(status, parsed.data.message, code, true, log);
  if (mode === 'strict') throw new ResponseMismatchError(parsed.error.issues);
  log.warn(
    {
      statusCode: status,
      issues: parsed.error.issues,
      // A 5xx's body is the cause the masked reply drops.
      ...(status >= 500 ? { body: payload } : {}),
    },
    'Error body has no message (log mode): sent with the generic one',
  );
  return errorReplyBody(
    status,
    STATUS_CODES[status] ?? 'Error',
    code,
    false,
    log,
  );
}

/**
 * Whether a payload is a web `Response` (detected as Fastify does).
 *
 * @param payload - A reply payload.
 * @returns `true` for a `Response`.
 */
function isWebResponse(payload: unknown): payload is Response {
  return (
    typeof payload === 'object' &&
    Object.prototype.toString.call(payload) === '[object Response]'
  );
}

/**
 * The status a payload goes out with: a web `Response`'s own status (Fastify
 * applies it after the `onSend` hooks), else the reply's.
 *
 * @param replyStatus - The reply's status.
 * @param payload - The payload at `onSend`.
 * @returns The status.
 */
export function sentStatus(replyStatus: number, payload: unknown): number {
  return isWebResponse(payload) ? payload.status : replyStatus;
}

/**
 * Release a payload that is replaced unread: a node stream is destroyed, a
 * web stream (a `Response`'s body included) cancelled.
 *
 * @param payload - The replaced payload.
 */
function discard(payload: unknown): void {
  if (isWebResponse(payload)) {
    discard(payload.body);
    return;
  }
  const stream = payload as
    { destroy?: unknown; cancel?: unknown } | null | undefined;
  if (typeof stream?.destroy === 'function')
    (stream as { destroy: () => void }).destroy();
  else if (typeof stream?.cancel === 'function')
    void (stream as { cancel: () => Promise<void> })
      .cancel()
      .catch(() => undefined);
}

/**
 * Parse JSON text.
 *
 * @param text - The text.
 * @returns The parsed value, boxed; `undefined` when it isn't JSON.
 */
function parseJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return undefined;
  }
}

/**
 * The standard body for a payload Fastify sends without serializing it (a
 * string, bytes, a stream, a web `Response`, nothing) under an error status.
 *
 * @remarks
 * Text (a string or bytes) sent with a JSON content type is parsed and
 * normalised exactly like an object payload
 * ({@link normaliseErrorPayload}), so a 5xx keeps its `message`. Other
 * text, and JSON text that doesn't parse, is the `message`: kept on a 4xx
 * (the status text when there is none), masked and logged on a 5xx (it is
 * not a standard body, so not deliberate). A stream or a `Response` is
 * released unread and gets the status text (a 5xx the generic message).
 *
 * @param status - Reply status (400 to 599).
 * @param payload - The raw payload.
 * @param contentType - The reply's content type when the payload was sent.
 * @param mode - Response validation mode.
 * @param log - Where mismatches and 5xx causes are logged.
 * @returns The body, as JSON.
 * @throws {@link ResponseMismatchError} in `'strict'` mode, for JSON text
 *   without a string `message`.
 */
export function rawErrorPayloadBody(
  status: number,
  payload: unknown,
  contentType: unknown,
  mode: 'strict' | 'log',
  log: CatalogRouteLogger,
): string {
  let text: string | undefined;
  if (typeof payload === 'string') text = payload;
  else if (payload instanceof Uint8Array)
    text = Buffer.from(payload).toString('utf8');
  else discard(payload);
  if (
    text !== undefined &&
    typeof contentType === 'string' &&
    isJsonContentType(contentType)
  ) {
    const parsed = parseJson(text);
    if (parsed)
      return JSON.stringify(
        normaliseErrorPayload(status, parsed.value, mode, log),
      );
  }
  return JSON.stringify(
    errorReplyBody(
      status,
      text ?? STATUS_CODES[status] ?? 'Error',
      undefined,
      false,
      log,
    ),
  );
}

/**
 * Headers an error never sets: they describe a body, and an error reply's
 * body is always the standard JSON one.
 */
const BODY_HEADERS = new Set([
  'content-type',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

/**
 * Whether a header value can be applied: a string, a number, or an array of
 * strings (e.g. several `set-cookie` values, as Fastify keeps them).
 *
 * @param value - The value.
 * @returns `true` when applicable.
 */
function isHeaderValue(value: unknown): value is string | number | string[] {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((v) => typeof v === 'string'))
  );
}

/**
 * Apply an error's or error result's headers to the reply, as Fastify does
 * for a thrown error's `headers`: string, number and string-array values
 * only; never `content-type`, `content-encoding`, `content-length` or
 * `transfer-encoding` (an error body is always the standard JSON one).
 *
 * @remarks
 * A name or value Node would reject (e.g. a CRLF in a value) is skipped and
 * logged at `debug`, so the reply still goes out from the catalog scope.
 *
 * @param reply - Fastify reply.
 * @param headers - The headers; ignored unless an object.
 */
export function setErrorHeaders(reply: FastifyReply, headers: unknown): void {
  if (typeof headers !== 'object' || headers === null) return;
  for (const [name, value] of Object.entries(headers)) {
    if (!isHeaderValue(value) || BODY_HEADERS.has(name.toLowerCase())) continue;
    try {
      validateHeaderName(name);
      for (const each of [value].flat())
        validateHeaderValue(name, String(each));
    } catch (error) {
      reply.log.debug({ header: name, err: error }, 'Error header skipped');
      continue;
    }
    void reply.header(name, value);
  }
}
